import json
from datetime import timedelta
from types import SimpleNamespace
from urllib.parse import quote

import pytest
from data_manager.document_types import (
    DOCUMENT_TYPE_FIELD,
    UNCLASSIFIED,
    annotate_document_type,
    document_type_column,
    get_document_types,
)
from data_manager.managers import apply_filters
from data_manager.prepare_params import Filters
from django.utils.timezone import now
from projects.models import Project
from projects.tests.factories import ProjectFactory
from tasks.models import Annotation, Task
from tasks.tests.factories import AnnotationFactory, AnnotationDraftFactory, PredictionFactory, TaskFactory
from tests.utils import project_id  # noqa: F401

CONFIG = '''<View><Image name="document" value="$image"/>
<Choices name="schema_type" toName="document" choice="single">
<Choice value="prescription" html="Đơn thuốc"/>
<Choice value="vat_invoice" html="Hóa đơn giá trị gia tăng"/>
</Choices></View>'''


def result(code, from_name='schema_type'):
    return [{'from_name': from_name, 'to_name': 'document', 'type': 'choices', 'value': {'choices': [code]}}]


def filtered(project, values, operator='contains', extra=None):
    tasks = Task.objects.filter(project=project)
    tasks.project = project
    tasks = annotate_document_type(tasks)
    items = [{'filter': f'filter:tasks:{DOCUMENT_TYPE_FIELD}', 'operator': operator, 'type': 'List', 'value': values}]
    if extra:
        items.append(extra)
    return set(apply_filters(tasks, Filters(conjunction='and', items=items), project, None).values_list('id', flat=True))


def test_labels_come_from_project_config():
    assert get_document_types(SimpleNamespace(label_config=CONFIG)) == [
        {'value': 'prescription', 'title': 'Đơn thuốc'},
        {'value': 'vat_invoice', 'title': 'Hóa đơn giá trị gia tăng'},
    ]
    assert get_document_types(SimpleNamespace(label_config='<View/>')) == []


@pytest.mark.django_db
def test_filter_and_counts_ignore_predictions_drafts_skips_and_other_controls():
    project = ProjectFactory(label_config=CONFIG)
    prescription, invoice, unknown = TaskFactory.create_batch(3, project=project)
    AnnotationFactory(task=prescription, result=result('prescription'))
    AnnotationFactory(task=invoice, result=result('vat_invoice'))
    AnnotationFactory(task=unknown, result=result('prescription', from_name='other_field'))
    AnnotationFactory(task=unknown, was_cancelled=True, result=result('prescription'))
    PredictionFactory(task=unknown, result=result('prescription'))
    AnnotationDraftFactory(task=unknown, result=result('prescription'))
    assert filtered(project, ['prescription']) == {prescription.id}
    assert filtered(project, ['prescription', 'vat_invoice']) == {prescription.id, invoice.id}
    assert filtered(project, [UNCLASSIFIED]) == {unknown.id}
    assert filtered(project, ['prescription'], 'not_contains') == {invoice.id, unknown.id}
    assert filtered(project, [UNCLASSIFIED], 'not_contains') == {prescription.id, invoice.id}
    assert filtered(project, []) == set()
    assert filtered(project, [], 'not_contains') == {prescription.id, invoice.id, unknown.id}
    column = document_type_column(project)
    assert column['title'] == 'Loại tài liệu'
    assert column['schema']['items'] == [
        {'value': UNCLASSIFIED, 'title': 'Chưa phân loại (1)'},
        {'value': 'prescription', 'title': 'Đơn thuốc (1)'},
        {'value': 'vat_invoice', 'title': 'Hóa đơn giá trị gia tăng (1)'},
    ]


@pytest.mark.django_db
def test_latest_annotation_updates_deletes_and_clears_without_backfill():
    project = ProjectFactory(label_config=CONFIG)
    task = TaskFactory(project=project)
    first = AnnotationFactory(task=task, result=result('prescription'))
    second = AnnotationFactory(task=task, result=result('vat_invoice'))
    assert filtered(project, ['vat_invoice']) == {task.id}
    Annotation.objects.filter(pk=first.pk).update(updated_at=now() + timedelta(seconds=1))
    assert filtered(project, ['prescription']) == {task.id}
    first.delete()
    assert filtered(project, ['vat_invoice']) == {task.id}
    second.result = []
    second.save()
    assert filtered(project, [UNCLASSIFIED]) == {task.id}
    other_project = ProjectFactory(label_config=CONFIG)
    TaskFactory(project=other_project)
    assert filtered(project, [UNCLASSIFIED]) == {task.id}


@pytest.mark.django_db
def test_unknown_values_and_malformed_legacy_entries_are_unclassified():
    project = ProjectFactory(label_config=CONFIG)
    task = TaskFactory(project=project)
    annotation = AnnotationFactory(task=task, result=result('unknown'))
    Annotation.objects.filter(pk=annotation.pk).update(result=['plain string', None, {}, *result('unknown')])
    assert filtered(project, [UNCLASSIFIED]) == {task.id}
    assert filtered(project, ['prescription']) == set()


@pytest.mark.django_db
def test_api_columns_and_saved_view(business_client, project_id):
    project = Project.objects.get(pk=project_id)
    project.label_config = CONFIG
    project.save()
    task = TaskFactory(project=project)
    AnnotationFactory(task=task, result=result('prescription'))
    columns = business_client.get(f'/api/dm/columns/?project={project.id}')
    assert columns.status_code == 200, columns.content
    assert any(column['id'] == DOCUMENT_TYPE_FIELD for column in columns.json()['columns'])
    filters = {'conjunction': 'and', 'items': [
        {'filter': f'filter:tasks:{DOCUMENT_TYPE_FIELD}', 'operator': 'contains', 'type': 'List', 'value': ['prescription']}
    ]}
    view = business_client.post('/api/dm/views/', data=json.dumps({'project': project.id, 'data': {'filters': filters}}), content_type='application/json')
    assert view.status_code == 201, view.content
    response = business_client.get(f"/api/tasks?view={view.json()['id']}")
    assert response.status_code == 200, response.content
    assert [item['id'] for item in response.json()['tasks']] == [task.id]
    inline = quote(json.dumps({'filters': filters}))
    response = business_client.get(f'/api/tasks?project={project.id}&query={inline}')
    assert response.status_code == 200, response.content
    assert [item['id'] for item in response.json()['tasks']] == [task.id]

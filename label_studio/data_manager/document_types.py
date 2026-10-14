"""Project-defined OCR document types, derived from submitted annotations without denormalization."""

from defusedxml import ElementTree
from django.db.models import Case, CharField, Count, F, Func, OuterRef, Subquery, Value, When
from django.utils.html import strip_tags
from rest_framework.exceptions import ValidationError

DOCUMENT_TYPE_FIELD = 'ocr_document_type'
UNCLASSIFIED = '__unclassified__'


def get_document_types(project):
    if project is None or not project.label_config:
        return []
    try:
        root = ElementTree.fromstring(project.label_config)
    except ElementTree.ParseError:
        return []
    control = next((node for node in root.iter('Choices') if node.get('name') == 'schema_type'), None)
    if control is None:
        return []
    options = []
    seen = set()
    for choice in control.iter('Choice'):
        code = choice.get('value')
        if not code or code in seen or code == UNCLASSIFIED:
            continue
        seen.add(code)
        label = strip_tags(choice.get('html') or choice.get('alias') or code).strip() or code
        options.append({'value': code, 'title': label})
    return options


class DocumentTypeValue(Func):
    """Extract only schema_type Choices, never a coincidental string in another OCR field."""

    output_field = CharField()
    arity = 1

    def as_sqlite(self, compiler, connection, **extra_context):
        expression, params = compiler.compile(self.source_expressions[0])
        entry = "CASE WHEN entry.type = 'object' THEN entry.value ELSE '{}' END"
        return (
            f"(SELECT json_extract({entry}, '$.value.choices[0]') FROM json_each({expression}) AS entry "
            f"WHERE json_extract({entry}, '$.from_name') = %s "
            f"AND json_extract({entry}, '$.type') = %s "
            f"AND json_type({entry}, '$.value.choices') = 'array' "
            f"AND json_type({entry}, '$.value.choices[0]') = 'text' LIMIT 1)",
            [*params, 'schema_type', 'choices'],
        )

    def as_postgresql(self, compiler, connection, **extra_context):
        expression, params = compiler.compile(self.source_expressions[0])
        return (
            f"(SELECT entry->'value'->'choices'->>0 FROM jsonb_array_elements("
            f"CASE WHEN jsonb_typeof({expression}) = 'array' THEN {expression} ELSE '[]'::jsonb END) AS entry "
            "WHERE entry->>'from_name' = %s AND entry->>'type' = %s "
            "AND jsonb_typeof(entry->'value'->'choices') = 'array' "
            "AND jsonb_typeof(entry->'value'->'choices'->0) = 'string' LIMIT 1)",
            [*params, *params, 'schema_type', 'choices'],
        )


def annotate_document_type(queryset):
    from tasks.models import Annotation

    codes = [option['value'] for option in get_document_types(getattr(queryset, 'project', None))]
    if not codes:
        return queryset.annotate(ocr_document_type=Value(None, output_field=CharField()))
    # Choose the latest submitted non-skipped annotation, even if it clears the type.
    # Deleting/updating an annotation is reflected on the next query; no backfill is needed.
    latest = (
        Annotation.objects.filter(task_id=OuterRef('pk'), project_id=OuterRef('project_id'), was_cancelled=False)
        .annotate(_document_type=DocumentTypeValue(F('result')))
        .annotate(
            _known_document_type=Case(
                When(_document_type__in=codes, then=F('_document_type')),
                default=Value(None),
                output_field=CharField(),
            )
        )
        .order_by('-updated_at', '-id')
        .values('_known_document_type')[:1]
    )
    return queryset.annotate(ocr_document_type=Subquery(latest, output_field=CharField()))


def document_type_column(project):
    from tasks.models import Task

    options = get_document_types(project)
    if not options:
        return None
    tasks = Task.objects.filter(project=project)
    tasks.project = project
    counts = dict(
        annotate_document_type(tasks).order_by().values_list(DOCUMENT_TYPE_FIELD).annotate(total=Count('id'))
    )
    options = [{'value': UNCLASSIFIED, 'title': 'Chưa phân loại'}, *options]
    for option in options:
        key = None if option['value'] == UNCLASSIFIED else option['value']
        option['title'] = f"{option['title']} ({counts.get(key, 0)})"
    return {
        'id': DOCUMENT_TYPE_FIELD,
        'title': 'Loại tài liệu',
        'type': 'List',
        'target': 'tasks',
        'schema': {'items': options, 'multiple': True},
        'hidden': True,
        'orderable': False,
        'help': 'Loại tài liệu trong Annotation được cập nhật gần nhất. Không dùng Prediction hoặc draft.',
        'visibility_defaults': {'explore': False, 'labeling': False},
        'project_defined': False,
    }


def document_type_filter(operator, value):
    from django.db.models import Q

    if operator not in ('contains', 'not_contains'):
        raise ValidationError('Loại tài liệu chỉ hỗ trợ bao gồm hoặc loại trừ.')
    values = value if isinstance(value, list) else [value]
    if len(values) > 1000 or any(not isinstance(item, str) for item in values):
        raise ValidationError('Danh sách loại tài liệu không hợp lệ.')
    expression = Q(ocr_document_type__in=[item for item in values if item != UNCLASSIFIED])
    if UNCLASSIFIED in values:
        expression |= Q(ocr_document_type__isnull=True)
    if operator == 'not_contains':
        excluded = ~expression
        # SQL NOT IN yields NULL for an unclassified task, not TRUE.
        if UNCLASSIFIED not in values:
            excluded |= Q(ocr_document_type__isnull=True)
        return excluded
    return expression

# Thử nghiệm Table Editor cho OCR

Frontend hỗ trợ thuộc tính `tableColumns` trên `TextArea`. Giá trị là JSON chứa
`child_schema` của field array: `field_key`, `field_name`, `data_type`.
Các kiểu hỗ trợ: string, number, boolean. Tên control và `toName` giữ nguyên.

## Dùng thử

1. Build frontend từ thư mục `web`: `bun run build`.
   Sau đó chạy `poetry run python label_studio/manage.py collectstatic --noinput`
   từ thư mục gốc và khởi động lại Django. Server đọc manifest trong
   `STATIC_ROOT/js/manifest.json` và giữ trong bộ nhớ; chỉ build rồi tải lại
   trình duyệt có thể vẫn trỏ đến bundle cũ.
2. Trong Label Studio, tạo project thử nghiệm và mở **Settings → Labeling Interface → Code**.
3. Dán nội dung `labeling_config_table_vi.xml`, Save và upload một ảnh.
4. Chọn Đơn thuốc, mở phần bảng chi tiết, nhấn **Thêm dòng** và nhập thuốc.
5. Submit, mở lại Task và kiểm tra bảng; sửa một ô rồi Update và mở lại lần nữa.
6. Thử Bảng kê chứng từ để kiểm tra Có / Không / trống, và bảng chi phí 18 cột để kiểm tra cuộn ngang.

Nếu trình duyệt vẫn dùng frontend cũ, tải lại trang bằng Ctrl+Shift+R.
Không cần migration. Việc tạo file XML không tự thay cấu hình project đang có.
XML gốc `labeling_config_compact_vi.xml` vẫn dùng giao diện CSV cũ.

## Lưu dữ liệu và Prediction

Bảng dùng cơ chế result của TextArea, ví dụ:

```json
{
  "from_name": "prescription__prescribed_medications",
  "to_name": "document",
  "type": "textarea",
  "value": {
    "text": ["[{\"sequence_number\":\"1\",\"medication_name\":\"Thuốc A\",\"quantity\":14,\"unit\":\"Viên\",\"duration_days\":7}]"]
  }
}
```

Ô trống được chuẩn hóa thành null; số 0 và boolean false được giữ nguyên.
Xóa hết dòng lưu `"[]"`. Bảng chưa thao tác chưa tạo result.
Số thứ tự là string theo schema, giữ được tiền tố 0; không tự đánh lại số thứ tự.

Editor đọc được cả `value.text` gồm các dòng CSV cũ (mỗi phần tử là một dòng)
và một chuỗi JSON Array mới. Dữ liệu cũ chỉ được chuyển sang JSON khi người dùng
thao tác bảng. Nếu dữ liệu không hợp lệ, editor hiện cảnh báo cùng các ô TextArea
gốc để sửa; không tự xóa hoặc bỏ qua dữ liệu. JSON có key ngoài schema được giữ lại.

Prediction cần dùng cùng `from_name`, `to_name`, `type` và một trong hai định dạng
trên. Raw response OCR phải được runner mapping sang result này trước khi import.
Runner chưa được sửa trong bản thử này.

## Xuất Ground Truth

Export JSON mặc định của Label Studio vẫn chứa result dạng TextArea, không tự biến
thành cấu trúc OCR. Với dữ liệu bảng mới, bộ chuyển đổi Ground Truth cần lấy:

```python
import json

field_key = result["from_name"].split("__", 1)[1]
ground_truth[field_key] = json.loads(result["value"]["text"][0])
```

Chỉ áp dụng đoạn này cho field array được xác định từ schema. Annotation CSV cũ
cần được đọc bằng CSV parser theo thứ tự child_schema, hoặc chỉnh bảng và lưu lại
để chuyển sang JSON. Không dùng `split(',')` vì nội dung ô có thể chứa dấu phẩy.

## Kiểm tra tự động

Từ thư mục `web`:

```bash
bun test --dom libs/editor/src/tags/control/TextArea/tableData.test.js libs/editor/src/tags/control/__tests__/TextArea.draft.test.jsx
```

Các kiểm tra bao gồm CSV có dấu phẩy trong ô, JSON round trip, kiểu dữ liệu,
ô trống, dữ liệu lỗi, lưu và khôi phục Annotation, draft, readonly, thêm/sửa/xóa
qua UI và giữ nguyên field TextArea khác.

Bản thử chưa có paste vùng từ Excel, chọn nhiều ô hoặc kéo điền dữ liệu.

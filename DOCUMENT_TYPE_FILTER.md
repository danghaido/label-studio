# Bộ lọc loại tài liệu

Data Manager có nút **Loại tài liệu** bên cạnh **Filters** nếu project có control
`<Choices name="schema_type">`. Nhãn lấy từ `html` của các `Choice` trong XML;
giá trị nội bộ vẫn là document_code, nên XML/Prediction/benchmark giữ mapping cũ.

- Tìm kiếm theo tên tiếng Việt; chọn một hoặc nhiều loại.
- **Bao gồm**: khớp ít nhất một loại đã chọn. **Loại trừ**: bỏ các loại đã chọn.
- **Chưa phân loại**: chưa có loại hợp lệ trong Annotation được chọn theo quy tắc dưới đây.
- Lựa chọn được lưu bằng cơ chế filter của Data Manager View, tải lại trang vẫn giữ.
- Có thể dùng cùng các filter khác và lưu thành nhiều View cho từng loại tài liệu.
- Số lượng bên cạnh tên là số Task trong toàn project, độc lập với các filter hiện tại.
  Nhấn nút Refresh của Data Manager để cập nhật danh sách và số lượng.

Loại tài liệu được đọc trực tiếp từ Annotation không bị skip có `updated_at` mới
nhất, dùng ID lớn nhất nếu cùng thời gian. Chỉ đọc result `from_name=schema_type`,
`type=choices`; giá trị phải thuộc các Choice đang có trong XML. Annotation mới nhất
không có loại hợp lệ sẽ khiến Task thành Chưa phân loại. Prediction, draft và
`task.data.document_code` không được dùng làm Ground Truth phân loại.

Sửa/xóa Annotation hoặc đổi loại được phản ánh ở lần truy vấn tiếp theo. Không cần
migration, đồng bộ signal, backfill database hoặc service bên ngoài. Các project
không có `schema_type` giữ toolbar cũ. SQL hỗ trợ SQLite và PostgreSQL; bộ kiểm tra
cục bộ chạy trên SQLite.

Sau khi sửa frontend, chạy `bun run build` trong `web`, rồi
`poetry run python label_studio/manage.py collectstatic --noinput` tại gốc repo và
khởi động lại Django để nạp manifest mới. Sau đó tải lại trình duyệt Ctrl+Shift+R.

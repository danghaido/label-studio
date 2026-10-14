# START — Chạy Label Studio từ source trên Ubuntu

Hướng dẫn này dành cho repository `HumanSignal/label-studio` đã clone về máy, sử dụng **Poetry** cho backend Django và **Bun** cho frontend. Ví dụ đường dẫn dự án: `~/work/label-studio`.

> **Lưu ý:** `python manage.py runserver` là development server, chỉ phù hợp để thử nghiệm cục bộ hoặc trong mạng LAN tin cậy. Không công khai trực tiếp lên Internet. Muốn host production cần application server, reverse proxy HTTPS, cấu hình bảo mật và backup.

## 1. Chuẩn bị

Cần có Git, Python tương thích với phiên bản source hiện tại, Poetry và Bun. Kiểm tra:

```bash
git --version
python --version
poetry --version
bun --version
```

Nếu đã có repository:

```bash
cd ~/work/label-studio
```

Nếu chưa clone:

```bash
git clone https://github.com/HumanSignal/label-studio.git
cd label-studio
```

> Repository thay đổi theo phiên bản. Nếu các script hoặc cấu trúc thư mục khác với tài liệu này, hãy kiểm tra `web/package.json`, `web/README.md` và hướng dẫn README của commit đang dùng.

## 2. Cài dependency backend (lần đầu hoặc khi cập nhật)

Tại thư mục gốc:

```bash
poetry install
```

Poetry cài dependency Python trong môi trường được quản lý cho project. Không cần `uv` nếu đã dùng Poetry.

## 3. Cài và build frontend (lần đầu hoặc sau khi sửa frontend)

```bash
cd ~/work/label-studio/web
bun install --frozen-lockfile
bun run build
```

Kiểm tra thư mục build mà backend kỳ vọng:

```bash
ls -lah dist/apps/labelstudio/
```

Nếu không thấy thư mục này, cần đọc output của `bun run build` và kiểm tra script build trong `web/package.json`. **Không thể sửa lỗi thiếu frontend build chỉ bằng `collectstatic`.**

## 4. Chuẩn bị database và static files

```bash
cd ~/work/label-studio

# Áp dụng các migration Django chưa chạy
poetry run python label_studio/manage.py migrate

# Gom static files theo cấu hình Django
poetry run python label_studio/manage.py collectstatic --noinput
```

- `migrate`: tạo/cập nhật cấu trúc bảng của database; không xóa data annotation chỉ vì chạy lại migration thông thường.
- `collectstatic`: thu thập CSS/JS/font đã có theo cấu hình Django; **không** build React/TypeScript.
- Cả hai không phải lệnh OCR hoặc data extraction.

Kiểm tra database đang trỏ tới đâu (hữu ích trước khi backup):

```bash
poetry run python label_studio/manage.py shell -c \
  "from django.conf import settings; print(settings.DATABASES)"
```

Thư mục lưu dữ liệu, đường dẫn SQLite và tệp ảnh cụ thể phụ thuộc cấu hình. Không giả định database luôn nằm trong thư mục repository.

## 5. Start Label Studio và chọn port

**Chỉ dùng trên máy đang chạy (an toàn hơn khi thử nghiệm):**

```bash
cd ~/work/label-studio
poetry run python label_studio/manage.py runserver 127.0.0.1:8080
```

Truy cập: <http://127.0.0.1:8080>

**Đổi sang port khác**, ví dụ `9000`:

```bash
poetry run python label_studio/manage.py runserver 127.0.0.1:9000
```

Truy cập: <http://127.0.0.1:9000>

**Cho các máy khác trong cùng mạng LAN truy cập (chỉ khi mạng tin cậy):**

```bash
poetry run python label_studio/manage.py runserver 0.0.0.0:8080
```

`0.0.0.0` là địa chỉ **lắng nghe trên tất cả interface**, không phải URL để nhập trong trình duyệt. Xem địa chỉ IP máy Ubuntu:

```bash
hostname -I
```

Nếu IP LAN là `192.168.1.100`, người khác mở `http://192.168.1.100:8080`. Máy chủ phải mở kết nối đến port đó qua firewall/network; cấu hình Django `ALLOWED_HOSTS`/CSRF và các thiết lập truy cập khác cũng phải phù hợp. Không tắt bảo vệ bảo mật một cách tùy tiện.

> **Quan trọng:** Chạy `runserver 0.0.0.0:8080` chỉ là thay đổi host/port lắng nghe. Nó **không tự động** tạo IP public, cấu hình router port-forward, tên miền hay HTTPS.

### Nếu port đã được sử dụng

```bash
ss -ltnp | grep ':8080'
```

Đổi sang port khác, ví dụ `8081`, hoặc dừng tiến trình đang chiếm port sau khi xác nhận đó là tiến trình bạn có thể dừng.

## 6. Dừng / khởi động lại

Khi `runserver` đang chạy foreground:

- Nhấn `Ctrl+C` để dừng.
- Để chạy lại, thực hiện lệnh ở mục 5.
- Đóng terminal, mất phiên SSH hoặc reboot có thể khiến development server dừng. Database không tự bị xóa khi process dừng.
- Muốn tự restart và hoạt động lâu dài: sử dụng `systemd` hoặc container với restart policy, đồng thời chuyển sang stack phục vụ production phù hợp; **không** chỉ đưa Django `runserver` ra Internet.

## 7. Kiểm tra lỗi phổ biến

**Trang đăng ký/đăng nhập mở được nhưng trang project trắng, log có** `SuspiciousFileOperation` **và** `/react-app/main.js` **hoặc** `/react-app/main.css` **trả 400:**

```bash
cd ~/work/label-studio
ls -lah web/dist/apps/labelstudio/
```

Nếu thư mục chưa tồn tại, chạy lại bước build frontend (mục 3), xem log lỗi build, sau đó chạy lại `collectstatic` và restart backend. Nếu build đã có mà vẫn lỗi, kiểm tra frontend asset manifest, cấu hình đường dẫn phục vụ static và log request; không mặc định lỗi chỉ do `collectstatic`.

**Migrate xong mà không thấy data:** Kiểm tra `settings.DATABASES` và biến môi trường; có thể bạn đang chạy với database khác.

**Máy khác không truy cập được:** Xác nhận backend bind `0.0.0.0`, dùng đúng IP LAN/port, kiểm tra `ss -ltnp`, firewall, routing, `ALLOWED_HOSTS` và cấu hình mạng. Không mở public port trước khi triển khai bảo mật.

## 8. Quy trình chạy thường ngày

Nếu dependencies, frontend build và migrations đều đã chuẩn bị xong, thường chỉ cần:

```bash
cd ~/work/label-studio
poetry run python label_studio/manage.py runserver 127.0.0.1:8080
```

Không cần `poetry install`, `bun run build`, `migrate` hoặc `collectstatic` mỗi lần mở ứng dụng nếu không thay đổi dependencies, source code hoặc cấu hình liên quan.

## 9. Checklist khi host cho nhóm dùng lâu dài

- Chọn một máy chủ luôn bật, domain/IP có thể truy cập.
- Dùng stack production + reverse proxy HTTPS; không dùng Django dev server công khai.
- Cấu hình `ALLOWED_HOSTS`, CSRF, tài khoản và quyền truy cập phù hợp.
- Backup định kỳ **database và ảnh/tệp nguồn**; kiểm tra khôi phục backup.
- Nếu nhiều người ghi đồng thời, cân nhắc PostgreSQL thay vì SQLite và thử tải trước khi dùng thật.
- Cấu hình `systemd`/container để tự khởi động lại và tập trung log.
- Không để API token, mật khẩu và dữ liệu nhạy cảm trong repo.

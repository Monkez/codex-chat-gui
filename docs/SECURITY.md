# Mô hình bảo mật local bridge

Local bridge có khả năng khởi chạy coding agent và mở file, vì vậy được xem là một privileged local service.

## Ranh giới tin cậy

- Browser UI không được mặc định là trusted chỉ vì chạy trên cùng máy.
- Mọi route `/api/*` ngoại trừ bootstrap session phải yêu cầu token.
- Bridge chỉ bind vào địa chỉ loopback.
- CORS chỉ cho phép origin được cấu hình rõ ràng.
- Browser không được tự yêu cầu `danger-full-access` nếu server chưa bật cờ cho phép.

## Giới hạn đầu vào

- Giới hạn kích thước JSON body và prompt.
- Giới hạn số lượng, kích thước từng attachment và tổng dung lượng.
- Chuẩn hóa tên file trước khi ghi attachment tạm.
- File action chỉ được phép thao tác bên trong workspace.

## Cấu hình nâng quyền

`danger-full-access` bị tắt mặc định. Chỉ bật cho môi trường local được kiểm soát bằng biến `CODEX_ALLOW_DANGER_FULL_ACCESS=1`.

Chính sách approval `never` cũng bị tắt mặc định. Chỉ bật bằng `CODEX_ALLOW_NEVER_APPROVAL=1` khi host đã có cơ chế xác nhận tương đương.

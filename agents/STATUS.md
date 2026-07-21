# Trạng thái dự án

## Nhánh hiện tại

`main`

## Đã hoàn thành

- Bridge bind loopback, session token, origin validation, request/permission limits.
- Attachment image/text/binary được chuyển tới runtime và cleanup theo run.
- Activity panel và auth control đã tách thành component riêng.
- UI có run trace, metrics, draft rollback, attachment limits và conditional auto-scroll.
- Đã thêm tài liệu, validation boundary và Windows helper scripts.
- Codex SDK/CLI đã nâng lên 0.144.6; `run.bat` tự kiểm tra và cập nhật runtime cũ.
- Settings hiển thị phiên bản runtime; lỗi model cache cũ được gom thành một hướng dẫn xử lý rõ ràng.

## Kiểm chứng cuối

- 19/19 tests pass.
- Demo build và library build pass.
- Package dry-run pass, có CSS và type declarations.
- Dependency audit: 0 vulnerability.
- Bridge smoke test: origin lạ 403, thiếu token 401, session hợp lệ 200.

## Hosting

Không triển khai bằng Sites: sản phẩm phụ thuộc privileged local Codex CLI bridge và host file actions, không tương thích với static/Cloudflare Worker runtime. Nếu cần bản public, nên tạo showcase riêng chạy mock data thay vì phát hành một bản UI mất chức năng.

## Quy ước kiểm chứng

- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd pack --dry-run --json`

## Lưu ý

- Không commit `dist`, log hoặc attachment tạm.
- React/ReactDOM là peer dependency của package UI.
- Adapter SDK phải giữ ID scoped theo run.

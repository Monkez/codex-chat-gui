# Codex Chat UI

## Mục tiêu

Codex Chat UI là một module React có thể nhúng vào web, Electron hoặc Tauri để hiển thị toàn bộ vòng đời của một phiên coding agent: yêu cầu của người dùng, suy luận tóm tắt, công cụ đang chạy, thay đổi file, trạng thái xác thực và kết quả cuối.

## Nguyên tắc sản phẩm

- Gọn ở trạng thái bình thường, mở rộng chi tiết khi người dùng cần.
- Mọi hành động nhạy cảm do host quyết định; component UI không tự truy cập hệ điều hành.
- Tiến trình phải dễ hiểu: đang chuẩn bị, đang chạy công cụ, đang thay đổi file hay đã hoàn tất.
- Ranh giới giữa UI, transport, adapter SDK và runtime phải độc lập để dễ thay thế.
- Local bridge chỉ phục vụ loopback, yêu cầu session token và không tự nâng quyền từ dữ liệu trình duyệt.

## Cấu trúc

- `src/module`: public React package, types và pure utilities.
- `src/demo`: host mẫu kết nối component với local bridge.
- `scripts/codex-ui-adapter.mjs`: chuyển SDK item thành transcript item.
- `scripts/codex-bridge.mjs`: auth, SDK runtime, SSE và host file actions.
- `scripts/runtime-compat.mjs`: kiểm tra runtime Codex trước khi khởi động và chặn phiên bản quá cũ.
- `tests`: unit/integration tests không phụ thuộc browser.
- `docs`: tài liệu dành cho người tích hợp và vận hành.
- `agents`: trạng thái kỹ thuật ngắn gọn cho các lượt phát triển tiếp theo.

## Tiêu chí hoàn thành đợt nâng cấp

1. Bridge không thể bị website ngoài gọi để chạy Codex.
2. Image/file attachment thật sự đến được runtime với giới hạn dung lượng rõ ràng.
3. Component không làm mất draft nếu submit thất bại và không ép auto-scroll khi người dùng đang đọc lịch sử.
4. Giao diện hiển thị rõ tiến trình, responsive và dùng được bằng bàn phím.
5. Build, tests và package dry-run đều thành công.
6. Runtime Codex cục bộ được kiểm tra trước khi chạy; giao diện hiển thị phiên bản để dễ chẩn đoán lỗi tương thích.


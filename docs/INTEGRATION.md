# Tích hợp Codex Chat UI

## Trách nhiệm của component

`CodexChat` chịu trách nhiệm render transcript, composer, attachment preview, modal, activity trace và trạng thái tương tác. Component không tự gửi request hay mở file hệ điều hành.

## Trách nhiệm của host

Host giữ transcript state và triển khai các callback:

- `onSubmit`: gửi prompt/attachment tới runtime.
- `onCancel`: hủy stream hiện tại.
- `onOpenFile`, `onRevealFile`, `onOpenFileWith`: tích hợp desktop hoặc local bridge.
- `onOpenExternalLink`: quyết định chính sách link ngoài.
- `onUndoChanges`, `onReviewChanges`: tích hợp hệ thống patch/review.
- `onPromptResolve`: giải quyết approval hoặc user choice của runtime.

Nếu host xóa user message có image attachment khỏi transcript trong khi component vẫn mounted, gọi `releaseAttachmentPreviews(message.attachments)` để giải phóng browser object URL.

## Ranh giới transport

Public package không phụ thuộc local bridge. `src/demo/bridgeClient.ts` chỉ là implementation mẫu. Một host khác có thể thay bằng WebSocket, Next.js route, Electron IPC hoặc Tauri command mà không thay transcript model.

## Runtime validation

Dữ liệu nhận từ network phải qua `isCodexTranscriptItem()` trước khi đưa vào state. TypeScript type assertion không thay thế runtime validation ở boundary.

## Tùy biến

- `headerControls`: model, permission hoặc project selector của host.
- `theme`: `light`, `dark`, `system`.
- `density`: `comfortable`, `compact`.
- `showActivityPanel`: hiển thị run trace và metrics.
- `transcriptWindowSize`: giới hạn row render gần nhất.
- `maxAttachments`, `maxAttachmentSizeBytes`, `maxTotalAttachmentBytes`: chính sách attachment phía UI.

## Trạng thái và action của file change

`CodexFileChangeMessage.status` có thể là `complete` hoặc `error`. Nút Undo/Review chỉ hiển thị khi message bật `canUndo`/`canReview` và host đã cung cấp callback tương ứng. Không bật capability nếu backend chưa thực hiện hành động thật.

## SSR và CSS

ESM entry có thể import trong Node/SSR mà không cần `document`. CSS package được scope trong `.codex-chat`, không reset `:root`, `body` hay `#root` của host. Component vẫn cần DOM khi render và tương tác.

## Kết thúc stream

Transport của host phải phát chính xác một sự kiện kết thúc `done` hoặc `error`. Nếu stream đóng mà không có terminal event, UI coi run là thất bại để không hiển thị trạng thái thành công sai.

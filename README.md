# PixmaxHub Plug

Chrome extension that adds helper actions to Pixmax's selected-node toolbar:

- Select linked nodes: keep the main node selected and add directly linked nodes.
- Create duplicate: run the same selection step, then trigger Pixmax's native copy and paste-with-links shortcuts.
- Repaired paste-with-links: add a fixed variant next to Pixmax's native context-menu paste-with-links action.
- Save to Eagle: send Pixmax's original asset URL to Eagle's local Web API.
- Like: save generated Pixmax results locally, or sync them through a shared Pixmax text node.
- Review Board: search shared Likes, filter by review status, mark results as Pick/Maybe/Reject, tag results, and keep team comments/likes in the shared canvas.
- Jimeng actions: place Review Board and **存入 Eagle** side by side in every generated video's native action bar, and preserve referenced images at their original inline `@` positions in the prompt.

## Local Likes

Generated results with Pixmax's native download action get a heart Like button in the selected-node toolbar.

By default, Likes are stored locally with `chrome.storage.local`.

To share Likes across the team, open the extension popup, enable **共享 Likes**, use the configured **数据库链接**, and enter your name. In that shared canvas, create one text node whose visible text or title matches that name. The extension will only update that user's text node and will read all marked user nodes when showing shared Likes.

Open the extension popup and click **Open Likes** to view, copy, open, or remove saved results. In the Likes page, **Open** adds a focus hint so the Pixmax page can select and highlight the original node after the canvas renders.

In shared mode, the Likes page becomes a lightweight review board. Team members can filter by owner, search across names/prompts/tags/comments, mark each result as Pick/Maybe/Reject, add tags, and leave likes/comments. Review data is stored in the shared canvas text node marked `PIXMAX_LIKES_SOCIAL_V1`.

Use **Export HTML** to download a standalone share page, or **Export JSON** to download the raw local Likes data for backup.

## Jimeng Video Likes

Open an authenticated `https://jimeng.jianying.com/ai-tool/generate...` page after loading the extension. Each generated video gets a Review Board heart beside **存入 Eagle** in Jimeng's native result action bar. Jimeng heart records always use the configured Pixmax shared Likes canvas, including their `source: "jimeng"` marker, video link, prompt, and reference-image data.

Each card gets a **存入 Eagle** button beside Jimeng's native result actions. Jimeng's confirmed native flow requests `/mweb/v1/get_local_item_list` with the current `item_id_list` and `is_for_video_download: true`, then downloads `data.item_list[0].video.transcoded_video.origin.video_url`. PixmaxHub also observes the workbench `get_asset_list` response, whose `video.transcoded_video.origin.video_url` is the same original-quality rendition. Eagle and Review Board actions resolve that response directly and do not require a native-download click.

Every Eagle and Review Board URL must pass an independent original-quality check using the official `*.jimeng.com` host or a bitrate materially above the card preview. If that check fails, the action stops with an error instead of falling back to the preview sample.

Each click refreshes the captured `get_asset_list` request and reads the server-declared `video.transcoded_video.origin.video_url`. The resolver binds one item by its `common_attr.id`, cover/poster URLs, and every transcoded rendition, so a card still matches when the player uses another CDN address. This origin rendition must be materially larger/higher bitrate than the card preview before it is marked verified. Automatic Eagle and Review Board actions never fall back to a recorded DOM element.

The old visible **录制协议** action has been removed. Normal heart and Eagle actions resolve the asset response directly and never invoke a recorded DOM element.

The same calibration records a complete protocol trace. It captures the recent Jimeng metadata request and response body, the native download-helper call, page `fetch`/XHR traffic, browser request/response headers, status codes, and redirects. Account-bearing headers such as Cookie and Authorization are redacted. A `PixmaxHub-Jimeng-Protocol-*.json` document is downloaded automatically after the transaction settles, and the most recent full trace plus 20 compact summaries are retained in local extension storage for comparison.

Jimeng records include the generation prompt, model labels, video dimensions, source page, and referenced image URLs. New records save the prompt as ordered text/image segments, so the Review Board and exported HTML can restore each referenced image at its original inline `@` position. The extension keeps the complete signed Jimeng original-download CDN URL and the separate player preview URL, then refreshes them when the same liked video appears on an authenticated Jimeng page. Jimeng CDN links can still expire or be deleted by the source service; the Review Board marks these records accordingly and does not claim to archive the media permanently.

## Eagle Import

1. Open Eagle App.
2. Click the extension icon, refresh the Eagle folder list, and select a target folder.
3. Select a Pixmax image, video, or audio node that has Pixmax's native download action.
4. Click the Eagle import action in the selected-node toolbar.

The extension sends Pixmax's original asset URL to Eagle at `http://localhost:41595`. When the Pixmax node has a generation prompt, the extension saves that prompt as the Eagle item description.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this extension folder.
5. Refresh an open `https://app.pixmax.cn/workspace/...` page.

## GitHub Online Update

This internal build can check a GitHub repository for a newer `manifest.json` version and install the allowed extension files into the local unpacked extension folder after the user clicks **安装更新**.

In the extension popup:

1. Enter a GitHub repository URL such as `https://github.com/owner/repo`, or a branch URL such as `https://github.com/owner/repo/tree/main`.
2. Click **选择/更换更新目录** and select the current unpacked extension folder.
3. Click **检查更新**.
4. If a newer version is found, click **安装更新**.

The updater downloads files from the repository root and writes only the files in the extension allowlist.

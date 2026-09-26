# LAB MASTER: BUILD LOCKABOX TỪ A–Z

> **LAB** = Lockabox. Tài liệu này là **prompt build cho agent** (Claude/Codex): hợp đồng thực thi, phạm vi, dữ liệu, luồng,
> roadmap từng phase và **ca nghiệm thu đánh số `LAB-AC-###`**. Agent đọc hết file trước khi viết dòng code đầu tiên.
>
> Phiên bản: 0.1 · Ngày: 2026-09-26 · Chủ sản phẩm: owner Spaca · Repo: `~/Lockabox` (repo mới, tách khỏi Spaca)
> Tên miền dự kiến: `lockabox.fun` (+ `lockabox.io`), chủ sản phẩm tự mua.

**Đọc nhanh:** mục 0 hợp đồng · mục 1 sản phẩm · mục 2 quyết định đã chốt · mục 3 nguồn dữ liệu (đã kiểm) · mục 4 chain ·
mục 5 stack · mục 6 dữ liệu · mục 7 luồng · mục 8 chống lạm dụng · mục 9 pháp lý · mục 10 UI ·
mục 11 roadmap · **mục 12 ca nghiệm thu** · mục 13 chỉ số · mục 14 vận hành · mục 15 prompt khởi động.

---

## 0. Hợp đồng thực thi dành cho agent

### 0.1. Thứ tự ưu tiên nguồn yêu cầu
1. Chỉ thị trực tiếp mới nhất của chủ sản phẩm trong phiên.
2. File này (`docs/LAB_MASTER.md`).
3. `docs/DECISIONS.md` (ADR ngắn, agent tạo khi chốt điều gì mới).
4. Tài liệu chính thức của bên thứ ba (DEX Screener, DexPaprika, Jupiter, aggregator EVM). **API bên thứ ba
   thay đổi nhanh: luôn đọc tài liệu hiện hành trước khi code tích hợp, không code theo trí nhớ.**

### 0.2. Định nghĩa hoàn thành
| Trạng thái | Nghĩa |
|---|---|
| `SPEC` | Có trong tài liệu, chưa code |
| `BUILT` | Code xong, test đơn vị chạy |
| `VERIFIED_LOCAL` | Ca nghiệm thu liên quan chạy qua trên máy local, có bằng chứng lưu trong `docs/evidence/` |
| `VERIFIED_STAGING` | Qua trên staging với chain thật (mainnet, số tiền nhỏ do chủ sản phẩm thực hiện) |
| `LIVE` | Mở cho người dùng thật, có monitoring và runbook |

Không gọi là "xong" hay "production ready" khi thiếu bằng chứng. Không tự tạo người dùng giả, giao dịch giả hay số liệu giả để
đạt chỉ số. Agent **không tự ký giao dịch bằng tiền thật**; mọi giao dịch mainnet do chủ sản phẩm ký.

### 0.3. Làm việc qua nhiều phiên
- `docs/BUILD_STATUS.md`: bảng mọi `LAB-AC-###` với trạng thái và link bằng chứng. Cập nhật cuối mỗi phiên.
- `docs/HANDOFF.md`: đang làm gì, vướng gì, bước tiếp theo, lệnh để chạy lại.
- Mỗi phase kết thúc bằng một commit/PR có danh sách ca đã qua.

### 0.4. Điều cấm tuyệt đối (mỗi điều có ca nghiệm thu ở mục 12)
1. **Không bao giờ bắt trả tiền để quay (roll).** Roll luôn miễn phí và không cần ký giao dịch.
2. **Không bán điểm, không chuyển điểm, không đổi điểm ra tiền.** Điểm chỉ sinh ra từ task.
3. **Không thưởng cho việc đăng bài lên X** (X cấm các app "reward users for posting" từ 15/1/2026). Không dùng API của X.
4. **Không crawl HTML** của DEX Screener hay bất kỳ trang nào. Chỉ dùng API chính thức.
5. **Không giữ tiền hay private key của người dùng.** Swap do người dùng tự ký trong ví của họ.
6. **Không thu phí swap, không cộng giá.** Báo giá hiển thị đúng như aggregator trả về.
7. **Không có "hòm trả tiền rồi mới biết giá trị".** Thứ ngẫu nhiên chỉ là *món nào*, không phải *được bao nhiêu*:
   roll miễn phí, còn mua là một bước riêng, tuỳ chọn, theo giá thị trường.
8. **Không hứa lợi nhuận** ở bất kỳ chữ nào trên sản phẩm (không "100x", "guaranteed", "moon"…).
9. **Không mở API proxy** trả lại dữ liệu thô của DEX Screener/DexPaprika cho bên thứ ba.
10. **Không có FOMO giả.** Ticker, thông báo lượt trúng lớn, bộ đếm "vừa có người mua" chỉ dùng sự kiện on-chain thật của người dùng LAB, mỗi dòng có link tx/proof. Không đếm ngược giả, không khan hiếm giả, không bot mua mồi.

---

## 1. Sản phẩm

### 1.1. Một câu
**Lockabox: quay một hòm, ra một memecoin ngẫu nhiên đang giao dịch thật, rồi tự quyết có mua ngay trong app hay không.**

### 1.2. Người dùng và việc chính
| Người dùng | Việc chính |
|---|---|
| **Người chơi** | Chọn chain và bộ lọc → roll miễn phí → xem kết quả → (tuỳ chọn) connect ví và swap ngay → khoe "pull" |
| **Dự án tài trợ** | Đưa token của mình vào hòm tài trợ, nạp token để phát cho người mở hòm bằng điểm, xem báo cáo |
| **Admin** | Duyệt tài trợ, gỡ coin khẩn cấp (kill switch), xử lý lạm dụng điểm |

### 1.3. Thuật ngữ
| Thuật ngữ | Nghĩa |
|---|---|
| **Case (hòm)** | Một nhóm coin có quy tắc: Trending, Mới ra < 24h, Meta (Cat/Dog/AI…), CTO, Sponsored |
| **Pool version** | Danh sách tài sản của một hòm tại một thời điểm, bất biến, có hash |
| **Roll** | Một lần quay; kết quả tái lập được từ seed |
| **Pull** | Tài sản ra từ một roll |
| **Tier** | Nhóm theo vốn hoá (cách A, chủ sản phẩm chọn 2026-09-27, tạm thời): Micro < 100K · Small 100K–1M · Mid 1M–10M · Large 10M–100M · ★ Top > 100M USD. Ngưỡng cấu hình được; tier đóng băng cùng pool; coin tài trợ không bao giờ được xếp tier cao hơn vốn hoá thật |
| **Points** | Điểm từ task, chỉ dùng để mở hòm tài trợ |
| **Hidden gate** | Bộ lọc ngầm (mục 2.3), không hiện nhãn cho người dùng |

### 1.4. Định vị
- Không phải bảng giá hay screener (không cạnh tranh DEX Screener, điều khoản API của họ cấm điều đó). Lockabox là **trò khám phá ngẫu nhiên + mua nhanh**.
- Khác DEX Screener boost: Lockabox không bán thứ hạng; tài trợ luôn gắn nhãn.
- Khác Kaito/Shillers: không trả tiền cho bài đăng, không dùng API X.

---

## 2. Quyết định sản phẩm đã chốt (2026-09-26)

### 2.1. Chốt bởi chủ sản phẩm
| # | Quyết định |
|---|---|
| D1 | **Đa chain, người dùng chọn chain** (chọn nhiều hoặc "Tất cả"). Có Robinhood và Arc |
| D2 | **Chỉ dùng nguồn dữ liệu miễn phí** (mục 3) |
| D3 | **Không nhãn rủi ro, không phân mức rủi ro.** Lấy tất cả, chỉ có disclaimer |
| D4 | **Connect ví và swap ngay trong app** sau khi quay, không bắt chuyển tab |
| D5 | **Không thu phí swap.** Doanh thu chỉ từ hòm tài trợ |
| D6 | **Không chặn Việt Nam.** Geo-block được dựng sẵn nhưng mặc định tắt |
| D7 | Tên sản phẩm Lockabox, viết tắt LAB, repo riêng |
| D9 | **Roll không giới hạn**; giao diện tối giản, không khí DeFi 2020 + vài nét hiện đại |
| D8 | **Không làm NFT** (đã cân nhắc NFT mù, chủ sản phẩm bỏ ngày 2026-09-26) |

### 2.2. Mặc định kỹ thuật (agent được đổi nếu có lý do, ghi vào `DECISIONS.md`)
| Tham số | Mặc định |
|---|---|
| Số roll | **Không giới hạn** (chủ sản phẩm chốt 2026-09-26). Chỉ có rate limit chống bot phía server (mặc định 1 roll/giây/thiết bị, không hiện cho người dùng) |
| Kích thước nhóm tối thiểu sau lọc (`MIN_POOL`) | 20 tài sản; dưới mức này khoá nút Roll |
| Tỷ lệ tier mặc định (coin) | Micro 35% · Small 30% · Mid 20% · Large 12% · Top 3% (cấu hình theo hòm, luôn công khai) |
| Làm mới giá tài sản trong hòm đang chạy | ≤ 5 phút |
| Dữ liệu cũ tối đa được hiển thị | 15 phút; quá thì tạm dừng hòm |
| Trượt giá mặc định swap | 3%, người dùng tự nâng tới tối đa 49% (có xác nhận) |
| Mở hòm tài trợ | 500 điểm |

### 2.3. Hidden gates (đề xuất của agent, chờ chủ sản phẩm xác nhận; mặc định BẬT)
Không phải nhãn rủi ro (D3 vẫn giữ): chỉ loại những tài sản **không thể có kịch bản thắng**, vì lệnh mua đi ra từ chính giao diện LAB.
1. **Honeypot**: bán thử (simulate) thất bại hoặc thuế bán ≥ 50% → loại khỏi mọi hòm, khoá swap.
2. **Thanh khoản gần 0**: < 1.000 USD → loại.

Mỗi gate có cờ cấu hình riêng; tắt được bằng cấu hình nếu chủ sản phẩm quyết định bỏ.

---

## 3. Nguồn dữ liệu (đã kiểm ngày 2026-09-26, chỉ miễn phí)

### 3.1. DEX Screener API: nguồn "đang được chú ý"
- Base `https://api.dexscreener.com`, không cần key, **dùng thương mại được** theo API Terms (cập nhật 18/8/2023).
- **Cấm:** làm sản phẩm cạnh tranh trực tiếp; bán lại/cho bên thứ ba dùng lại API; dùng tên/logo gây hiểu nhầm là được bảo trợ;
  tạo tải bất thường. Giấy phép **thu hồi được bất cứ lúc nào, không báo trước**.
- Endpoint có trong tài liệu (60 lượt/phút): `/token-profiles/latest/v1`, `/token-profiles/recent-updates/v1`,
  `/community-takeovers/latest/v1`, `/ads/latest/v1`, `/metas/trending/v1`, `/metas/meta/v1/{slug}`. Có WebSocket
  `wss://api.dexscreener.com` cho profiles, boosts, CTO, ads.
- Endpoint giá/thanh khoản **đang chạy nhưng không còn trong tài liệu hiện hành** (nguồn thứ ba ghi ~300 lượt/phút):
  `/tokens/v1/{chain}/{addrs}` (**tối đa 30 kết quả/lần**), `/token-pairs/v1/...`, `/latest/dex/pairs/...`,
  `/latest/dex/search` (30 kết quả, không phân trang), `/token-boosts/latest|top/v1` (30). → Coi là **không cam kết**.
- Các feed "latest" là cửa sổ trượt 30 mục; poll mỗi phút và lưu lại để tích luỹ.
- Có dữ liệu chain `robinhood`, `arc` (cùng solana, base, bsc, ethereum…).

### 3.2. DexPaprika: nguồn "mọi pool mới"
- Key miễn phí (không thẻ): **100.000 credit / 30 ngày lăn, 30 lượt/phút**. Không key: 10.000/30 ngày/IP, 15 lượt/phút.
  429 = quá tốc độ (chờ rồi thử lại); 402 = hết credit (dừng, cảnh báo).
- 36 mạng, **có `robinhood` và `arc`**. `/networks/{network}/pools/search` (cursor, tối đa 100/trang, lọc volume, thanh khoản,
  ngày tạo). Endpoint `/pools` cũ đã bị gỡ (410).
- Đo ngày 26/9: Robinhood ~300 pool mới/giờ, Arc ~200/giờ; trong 100 pool mới nhất chỉ 11 (Robinhood) và 1 (Arc) có thanh khoản ≥ 10k USD.
- **Việc cần làm ở R0:** đọc điều khoản thương mại của DexPaprika (chưa kiểm).

### 3.3. RPC công khai / gói miễn phí
- Dùng cho hidden gates và xác minh on-chain (giữ coin, trạng thái giao dịch). Không dùng RPC công khai cho luồng nóng của người dùng
  nếu có gói miễn phí ổn định hơn.
- Robinhood, Arc: RPC công khai cần kiểm ở R0.

### 3.4. Biểu đồ giá (đã kiểm 2026-09-27)
- API miễn phí của DEX Screener **không có dữ liệu nến/lịch sử và không có danh sách giao dịch** → không thể (và không được) vẽ chart từ DEX Screener. **Cấm** gọi các endpoint nội bộ mà trang dexscreener.com dùng để vẽ chart (không phải API chính thức, vi phạm điều khoản + chống bot).
- Nguồn được phép, theo thứ tự ưu tiên:
  0. **Widget nhúng của DEX Screener** (iframe `https://dexscreener.com/{chain}/{pair}?embed=1&theme=dark&trades=0&info=0`). Đã kiểm 2026-09-27: URL embed trả 200 và **không có** `X-Frame-Options` (trang thường có `SAMEORIGIN`), tức họ chủ động cho nhúng; widget hiện dòng "Tracked by DEX Screener". Chưa có văn bản điều khoản riêng cho embed → xin xác nhận trong email R0; test hiển thị dữ liệu từ domain thật ở staging (test từ file local chỉ ra "No data here").
  1. **Widget nhúng chính thức của GeckoTerminal** (iframe `?embed=1&info=0&swaps=0`, có trong tính năng "Share → Embed Charts" của họ). Điều khoản thương mại và yêu cầu ghi nguồn chưa đọc được → xác nhận ở spike R0 (liên hệ partnership nếu cần).
  2. **Tự vẽ từ OHLCV của DexPaprika** + thư viện TradingView Lightweight Charts (giấy phép Apache-2.0, giữ ghi nguồn TradingView). Gói miễn phí: không key = nến ≥ 1h trong 24h; key miễn phí = nến ≥ 10m trong 7 ngày; nến 1m/5m cần gói trả phí → bản miễn phí chỉ có khung 15m/1h/4h.
- Bảng "All trades" chỉ bật khi có nguồn giao dịch được phép (DexPaprika transactions hoặc tự đọc on-chain); tab mặc định là **"Buys via Lockabox"** (dữ liệu của chính LAB).
- Không dùng tên, logo DEX Screener cho chart; chỉ link "View on DEX Screener".

### 3.5. Quy tắc dùng nguồn
- Một **worker phía server** nạp dữ liệu theo lịch, lưu DB, có cache. **Không bao giờ gọi API bên thứ ba trong request roll.**
- Bộ đếm ngân sách lượt gọi cho từng nguồn; vượt 80% → cảnh báo.
- Adapter nguồn có dự phòng: DEX Screener lỗi → dùng DexPaprika cho giá; cả hai lỗi → tạm dừng hòm (không hiện giá cũ quá 15 phút).
- Chỉ hiển thị link "View on DEX Screener"; không dùng logo của họ.
- R0: gửi DEX Screener mô tả use case, xin xác nhận bằng văn bản (lưu vào `docs/evidence/`).

---

## 4. Chain

- Registry cấu hình (`config/chains.ts` hoặc bảng `chains`): `id`, tên, họ (`solana` | `evm`), id trên DEX Screener, id trên
  DexPaprika, RPC, explorer, route swap, cờ bật/tắt từng tính năng.
- **Một chain chỉ được bật khi đủ:** nguồn dữ liệu trả về đúng chain, hidden gates chạy được, và route swap chạy được
  (hoặc swap tắt riêng chain đó, chỉ còn "View on DEX").
- Adapter theo họ chain:
  - **Solana:** swap qua Jupiter; honeypot qua quote bán + simulate; đọc mint/freeze authority chỉ để lưu (không hiện nhãn).
  - **EVM:** swap qua aggregator (0x, 1inch hoặc LI.FI, chọn cái hỗ trợ chain và không thu phí khi `fee = 0`); honeypot qua
    `eth_call` giả lập bán; approve **đúng số tiền**, không bao giờ approve vô hạn.
  - **Robinhood, Arc:** pool chủ yếu trên Uniswap V2/V3/V4. Nếu aggregator chưa hỗ trợ → dựng lệnh trực tiếp qua router Uniswap
    của chain đó (địa chỉ router lấy từ tài liệu chính thức, ghi nguồn trong code).
- Thứ tự bật đề xuất: Solana → Base → BSC → Ethereum → Robinhood → Arc → các chain khác.

---

## 5. Tech stack

| Lớp | Lựa chọn |
|---|---|
| Web | Next.js (App Router) + TypeScript strict |
| DB | PostgreSQL + Drizzle ORM, migration có version |
| Worker | Tiến trình Node riêng (job queue trên Postgres, ví dụ pg-boss) cho nạp dữ liệu, hidden gates, phát token tài trợ |
| Ví Solana | Solana Wallet Adapter (Phantom, Solflare, Backpack…) + Sign-In With Solana |
| Ví EVM | wagmi + viem + WalletConnect/Reown + SIWE |
| Swap | Jupiter API (Solana); aggregator EVM; router Uniswap fallback |
| Random | Commit–reveal HMAC-SHA256 (mục 7.2) |
| Test | Vitest (unit), test DB thật (integration), Playwright (e2e, mobile 375px) |
| CI | Lint, typecheck, unit, integration, e2e trên mỗi PR |
| Hạ tầng | Vercel hoặc tương đương cho web; Postgres managed; worker chạy riêng; secrets chỉ trong env |

Cấu trúc repo đề xuất: `app/` (routes), `src/modules/{chains,sources,gates,cases,rolls,swap,points,sponsors,admin}`,
`src/lib/`, `worker/`, `drizzle/`, `tests/{unit,integration,e2e}`, `docs/`.

---

## 6. Mô hình dữ liệu

| Bảng | Cột chính |
|---|---|
| `users` | id, created_at, age_confirmed_at, locale, flags |
| `wallets` | id, user_id, chain_family, address (unique), verified_at |
| `auth_nonces` | nonce, address, expires_at (5 phút), used_at |
| `chains` | id, family, dexscreener_id, dexpaprika_id, enabled, swap_enabled |
| `assets` | id, chain_id, address/mint, symbol, name, first_seen_at, sources[] |
| `asset_snapshots` | asset_id, taken_at, price_usd, market_cap, fdv, liquidity_usd, volume_24h, price_change, pair_created_at, dex_id, boosted |
| `gate_results` | asset_id, gate, passed, reason, checked_at |
| `cases` | id, slug, kind, chain_ids[], rules (json), tier_odds (json), cost_points (null = free), sponsor_id, active |
| `case_pools` | id, case_id, version, asset_ids[], hash, created_at |
| `rolls` | id, user_id\|device_id, case_id, pool_id, filters (json), server_seed_hash, client_seed, nonce, result_asset_id, tier, created_at |
| `server_seeds` | id, hash, seed (lộ ra khi xoay), active_from, revealed_at |
| `trades` | id, roll_id, user_id, wallet, chain_id, quote (json), tx_hash, status, created_at |
| `points_ledger` | id, user_id, delta, reason, ref_id, created_at (**append-only**) |
| `tasks` / `task_completions` | loại task, điểm, giới hạn; user, task, evidence, created_at |
| `sponsors` / `sponsor_campaigns` | ví, dự án, token, số lượng mỗi lần phát, ngân sách, lịch, trạng thái duyệt |
| `sponsor_vault_txs` | nạp, phát, hoàn; tx_hash, số lượng |
| `redemptions` | user, campaign, amount, tx_hash, status (idempotent key) |
| `moderation` | asset_id, action (`quarantine`\|`kill`), by, reason, at |
| `audit_log` | actor, action, target, at |

**Bất biến:**
- Số dư điểm = `SUM(points_ledger.delta)`; không bao giờ âm; chỉ task (+) và mở hòm tài trợ (−) ghi vào ledger.
- Mỗi roll tái lập được từ (`server_seed`, `client_seed`, `nonce`, `pool`, `filters`).
- Một `redemptions` chỉ gửi token đúng một lần (khoá idempotent).
- `case_pools` không sửa sau khi tạo.

---

## 7. Luồng chính

### 7.1. Nạp và lọc tài sản (worker)
1. Mỗi phút: poll feed DEX Screener (profiles, boosts, CTO, ads, metas) → upsert `assets`.
2. Mỗi 15 phút mỗi chain bật: DexPaprika `pools/search` sắp theo `created_at` → upsert.
3. Tài sản mới → chạy hidden gates → ghi `gate_results`.
4. Mỗi ≤ 5 phút: làm mới snapshot cho tài sản trong các hòm đang chạy (lô 30 địa chỉ/lượt DEX Screener).
5. Dựng `case_pools` mới khi danh sách thay đổi; roll luôn dùng version mới nhất tại thời điểm roll.

### 7.2. Roll (miễn phí, kiểm chứng được)
1. Người dùng chọn chain + hòm + bộ lọc → server trả số tài sản khớp, tỷ lệ tier hiện hành, `server_seed_hash`.
2. `client_seed` (người dùng đổi được) + `nonce` tăng dần.
3. `r = HMAC_SHA256(server_seed, client_seed + ":" + nonce)`; 52 bit đầu → số thực [0,1) chọn tier theo tỷ lệ;
   52 bit kế → chọn đều trong tier (nếu tier rỗng: dời sang tier kế, quy tắc công khai).
4. Hiệu ứng cuộn (thuần UI) dừng ở kết quả đã tính.
5. Trang `/verify`: nhập seed đã lộ + client seed + nonce + pool hash → ra đúng kết quả.
6. `server_seed` xoay định kỳ (ví dụ mỗi 24h) và công bố seed cũ.

### 7.3. Kết quả → swap trong app (coin)
1. Thẻ kết quả: tên, chain, giá, vốn hoá, thanh khoản, tuổi, volume, link "View on DEX Screener" và explorer. **Không nhãn rủi ro.**
2. Ô swap: số tiền (nhập + nhanh $5/$10/$25 tương đương token gốc), báo giá (số nhận, price impact, trượt giá, phí mạng), dòng
   **"No Lockabox fee"**, disclaimer.
3. Trước khi bật nút Swap: gọi lại hidden gate honeypot (bán thử) cho đúng số tiền.
4. Người dùng bấm Swap → ví hiện lệnh → ký → hiển thị pending/confirmed/failed + link explorer → ghi `trades`.
5. Nút "Share pull" tạo ảnh chia sẻ (không kèm link giới thiệu có thưởng).

### 7.4. Task và điểm
- Task: check-in hằng ngày, hoàn thiện hồ sơ, xác minh đang giữ một tài sản đã pull (đọc on-chain), bình chọn hòm/meta tuần,
  mời bạn (chỉ tính khi người được mời đạt điều kiện).
- **Không có task liên quan đăng bài X**; validator cấu hình task từ chối loại này.
- Swap **không** cộng điểm.

### 7.5. Hòm tài trợ
1. Dự án đăng ký bằng ví, nộp token + chain + số lượng phát mỗi lần + tổng ngân sách + lịch.
2. Token qua hidden gates + admin duyệt thủ công.
3. Dự án nạp token vào **vault phân phối** của campaign (ví hot do server quản lý, giới hạn số dư, chỉ phát theo redemption).
   Phí tài trợ trả cho Lockabox bằng chuyển khoản on-chain (USDC) tới ví treasury; xác minh bằng tx hash.
4. Người dùng mở hòm tài trợ bằng điểm → roll trong pool tài trợ → nhận đúng số token cấu hình vào ví (idempotent, retry an toàn).
5. Hết lịch → token còn lại hoàn cho dự án.
6. Mọi chỗ hiển thị tài sản tài trợ đều có nhãn **"Sponsored"** (tiếng Việt: **"Quảng cáo · Sponsored"**).
7. Dashboard dự án: số roll, số lượt nhận, số ví duy nhất, số lượt swap sau khi nhận; xuất CSV.

### 7.6. Admin
- Duyệt campaign; kill switch (gỡ coin khỏi mọi hòm + khoá swap trong ≤ 60 giây); danh sách chặn; xem và khoá tài khoản
  lạm dụng; mọi thao tác ghi `audit_log`.

---

## 8. Chống lạm dụng
- Roll không giới hạn số lượt; chỉ rate limit chống bot (mục 2.2) và chặn lưu lượng bất thường.
- Một ví chỉ gắn một tài khoản; tài khoản mới chờ 24h mới đổi được điểm.
- Mời bạn: tối đa 10/ngày; chỉ tính khi người được mời đã connect ví và có ít nhất 3 roll trong 3 ngày khác nhau.
- Điểm bất thường (tốc độ, cụm IP, ví tạo cùng lúc) → giữ điểm chờ duyệt.
- Captcha chỉ ở luồng đăng ký/đổi điểm, do người dùng tự giải.
- Rate limit mọi endpoint ghi.

---

## 9. Pháp lý và tuân thủ (không phải tư vấn pháp lý; cần luật sư xác nhận trước `LIVE`)

| Vấn đề | Cách LAB xử lý |
|---|---|
| **Cờ bạc** (trả tiền để nhận kết quả ngẫu nhiên có giá trị khác nhau) | Roll miễn phí (0.4.1); swap là bước riêng, tuỳ chọn, theo giá thị trường (0.4.7); điểm không mua được (0.4.2) |
| **Chính sách X** (cấm app thưởng cho đăng bài, 15/1/2026) | Không task X, không API X (0.4.3) |
| **Điều khoản DEX Screener** | Chỉ API, không proxy, không cạnh tranh, không dùng logo; xin xác nhận bằng văn bản |
| **Luật Quảng cáo 2025 (VN, hiệu lực 1/1/2026)** | Tài sản tài trợ luôn gắn nhãn "Quảng cáo · Sponsored"; dự án tài trợ được duyệt độ tin cậy |
| **Nghị quyết 05/2025/NQ-CP (VN)** | Chủ sản phẩm quyết định **không chặn VN** (D6). Rủi ro: sau mốc 6 tháng kể từ khi có đơn vị được cấp phép, giao dịch tài sản mã hoá ngoài tổ chức được cấp phép có thể bị xử phạt. Geo-block dựng sẵn, mặc định tắt |
| **Lời khuyên đầu tư** | Disclaimer trên màn roll, ô swap, trang chia sẻ: "Random pick, not advice. Memecoins can go to zero." |
| **Tuổi** | Xác nhận 18+ lần đầu |
| **Dữ liệu cá nhân** | Chỉ lưu địa chỉ ví, thiết bị (hash), IP (hash) cho chống lạm dụng; có chính sách quyền riêng tư |

Checklist luật sư (`docs/LEGAL_CHECKLIST.md`) phải được một người thật ký xác nhận; agent không được tự đánh dấu.

---

## 10. UI

Tham chiếu mockup: `~/Spaca/content/product/cases-mockup.html` (bố cục, dải cuộn, thẻ kết quả, task). **Thay đổi bắt buộc so với mockup:**
- Bỏ nút "Open for $10" → nút **Roll** (miễn phí) + số roll còn lại.
- Thêm **chọn chain** và **thanh bộ lọc** (chain, loại hòm, vốn hoá, thanh khoản tối thiểu, tuổi, volume 24h, biến động, ẩn/hiện Sponsored) + số tài sản khớp.
- Bỏ các dòng kiểm tra an toàn/nhãn rủi ro trên thẻ kết quả (D3).
- Ô swap ngay trong thẻ kết quả + dòng "No Lockabox fee".
- Nhận diện riêng của Lockabox (không dùng nhận diện Spaca).

Màn hình: Cases · Roll/Result · Earn points · Best pulls (bảng người chơi, cho phép ẩn danh/opt-out) · Verify · Sponsor dashboard · Admin · Legal.

---

## 11. Roadmap

| Phase | Nội dung | Cổng qua phase (ca bắt buộc) |
|---|---|---|
| **LAB-R0** | Nền tảng: repo, CI, DB, auth ví Solana + EVM, registry chain, client DEX Screener + DexPaprika có ngân sách, feature flags, **spike** (Robinhood/Arc RPC + route swap, aggregator EVM, điều khoản DexPaprika, email DEX Screener) | AC-001 → AC-012 |
| **LAB-R1** | Nạp tài sản coin, hidden gates, tier, pool version, bộ lọc người dùng, dự phòng nguồn | AC-013 → AC-027 |
| **LAB-R2** | Roll miễn phí kiểm chứng được, thẻ kết quả, connect ví, **swap trong app** (Solana + 1 EVM), disclaimer, 18+, chia sẻ | AC-028 → AC-048 |
| **LAB-R3** | Task, ledger điểm, chống sybil, Best pulls | AC-049 → AC-058 |
| **LAB-R4** | Hòm tài trợ: đăng ký, duyệt, vault phân phối, redemption, nhãn Sponsored, dashboard, kill switch | AC-059 → AC-070 |
| **LAB-R5** | Mở rộng chain (Robinhood, Arc…), hòm Meta/CTO/Mới ra, i18n en/vi, hiệu năng | AC-071 → AC-077 |
| **LAB-R6** | Sẵn sàng launch: trang pháp lý, checklist luật sư, monitoring, runbook có diễn tập, tải thử, bảo mật, đăng ký domain với ví | AC-078 → AC-089 |

---

## 12. Ca nghiệm thu

Cột "Kiểm": U = unit, I = integration với DB thật, E = e2e Playwright, M = thủ công có bằng chứng (ảnh, tx hash, log).

### R0: Nền tảng
| Mã | Ca | Kiểm |
|---|---|---|
| LAB-AC-001 | `pnpm lint`, `typecheck`, `test` đều xanh trên CI cho mỗi PR | I |
| LAB-AC-002 | Migration chạy lên và xuống sạch trên DB rỗng | I |
| LAB-AC-003 | Đăng nhập bằng ví Solana (SIWS) tạo user; đăng nhập lại cùng ví ra cùng user | E |
| LAB-AC-004 | Đăng nhập bằng ví EVM (SIWE) như trên | E |
| LAB-AC-005 | Nonce ký chỉ dùng một lần, hết hạn sau 5 phút; ký lại nonce cũ bị từ chối | I |
| LAB-AC-006 | Bật/tắt một chain hoặc tính năng của chain chỉ bằng cấu hình, không sửa code | I |
| LAB-AC-007 | Client DEX Screener có token bucket (60/phút feed, 300/phút giá); 429 → backoff; không bao giờ được gọi từ request roll | U+I |
| LAB-AC-008 | Client DexPaprika đọc key từ env; đếm credit; 402 → dừng job + cảnh báo | U |
| LAB-AC-009 | Không có mã crawl HTML trong repo (kiểm bằng rule lint/grep cho HTML parser và fetch tới trang web DEX Screener) | U |
| LAB-AC-010 | Không secret nào trong repo; `.env.example` đủ biến | I |
| LAB-AC-011 | Báo cáo spike `docs/spikes/R0.md`: RPC + route swap Robinhood/Arc, aggregator EVM chọn được, điều khoản DexPaprika | M |
| LAB-AC-012 | Email/ticket gửi DEX Screener mô tả use case được lưu trong `docs/evidence/` | M |

### R1: Dữ liệu, hidden gates, bộ lọc
| Mã | Ca | Kiểm |
|---|---|---|
| LAB-AC-013 | Job feed DEX Screener chạy mỗi phút, lưu tài sản mới với nguồn và `first_seen_at`, không trùng | I |
| LAB-AC-014 | Job DexPaprika duyệt cursor theo `created_at`, dừng khi gặp pool đã biết, không trùng | I |
| LAB-AC-015 | Làm mới snapshot theo lô 30 địa chỉ; tài sản trong hòm đang chạy không cũ quá 5 phút | I |
| LAB-AC-016 | Hidden gate honeypot: token giả lập không bán được bị loại, lý do được lưu | I |
| LAB-AC-017 | Hidden gate thanh khoản < 1.000 USD bị loại | U |
| LAB-AC-018 | Tắt từng hidden gate bằng cấu hình thì tài sản tương ứng quay lại hòm | I |
| LAB-AC-019 | Không API công khai hay màn hình nào trả nhãn/mức rủi ro (D3) | E |
| LAB-AC-020 | Mỗi tài sản có đúng một tier theo cấu hình | U |
| LAB-AC-021 | `case_pools` bất biến, có hash; sửa trực tiếp bị DB từ chối | I |
| LAB-AC-022 | DEX Screener lỗi > 10 phút → giá lấy từ DexPaprika; cả hai lỗi → hòm tạm dừng, không hiện giá cũ quá 15 phút | I |
| LAB-AC-023 | Không endpoint nào trả lại dữ liệu thô DEX Screener/DexPaprika ngoài các trường LAB cần hiển thị (không proxy) | I |
| LAB-AC-024 | Bộ lọc (chain nhiều, loại hòm, vốn hoá, thanh khoản, tuổi, volume, biến động, Sponsored) trả đúng số tài sản khớp | I |
| LAB-AC-025 | Sau lọc < `MIN_POOL` → nút Roll khoá kèm thông báo nới bộ lọc | E |
| LAB-AC-026 | Tỷ lệ tier hiển thị cập nhật theo bộ lọc, tổng = 100% | U |
| LAB-AC-027 | Robinhood và Arc có dữ liệu nếu spike R0 bật chúng; nếu không, chain hiển thị "Coming soon" | E |

### R2: Roll, ví, swap
| Mã | Ca | Kiểm |
|---|---|---|
| LAB-AC-028 | Roll không cần ký giao dịch, không cần thanh toán, chạy được khi chưa connect ví | E |
| LAB-AC-029 | Không tồn tại endpoint nhận tiền để roll (quét route) | I |
| LAB-AC-030 | `server_seed_hash` hiển thị trước roll; `/verify` tái lập đúng kết quả sau khi seed lộ | E |
| LAB-AC-031 | Cùng (seed, client seed, nonce, pool, filters) luôn ra cùng kết quả; 10.000 roll mô phỏng lệch tỷ lệ tier < 1 điểm % | U |
| LAB-AC-032 | Roll không có giới hạn số lượt trong ngày; rate limit chống bot (1 roll/giây/thiết bị) trả 429 khi vượt, không hiện bộ đếm lượt còn lại | I |
| LAB-AC-033 | Thẻ kết quả hiển thị đủ trường mục 7.3, link DEX Screener và explorer đúng | E |
| LAB-AC-034 | Disclaimer hiện ở màn roll và ô swap | E |
| LAB-AC-035 | Xác nhận 18+ ở lần vào đầu, lưu lại | E |
| LAB-AC-036 | Connect Phantom/Solflare (Solana) và MetaMask/Rabby/WalletConnect (EVM) | E |
| LAB-AC-037 | Swap Solana qua Jupiter: báo giá có số nhận, price impact, trượt giá, phí mạng; lệnh dựng ra **không có phí nền tảng** | I+M |
| LAB-AC-038 | Swap EVM qua aggregator: approve đúng số tiền, không approve vô hạn | I+M |
| LAB-AC-039 | Bán thử thất bại → nút Swap khoá, tài sản bị cách ly và rời mọi hòm trong ≤ 60 giây | I |
| LAB-AC-040 | Swap chỉ xảy ra khi người dùng bấm và ký; không bao giờ tự động sau roll | E |
| LAB-AC-041 | Server không bao giờ nhận private key hay seed phrase; chỉ lưu tx hash | U+I |
| LAB-AC-042 | Trạng thái giao dịch pending/confirmed/failed hiển thị đúng, có link explorer | E+M |
| LAB-AC-043 | Số nhận trong báo giá LAB khớp báo giá gốc của aggregator (không phí ẩn) | I |
| LAB-AC-044 | Trượt giá mặc định 3%, nâng tới 49% cần xác nhận | E |
| LAB-AC-045 | Chain không có route swap → chỉ hiện "View on DEX", không có nút Swap | E |
| LAB-AC-046 | Ảnh chia sẻ pull tạo đúng, không chứa link giới thiệu có thưởng | E |
| LAB-AC-047 | Giao diện dùng được ở 375px (roll, kết quả, swap) | E |
| LAB-AC-048 | Cờ geo-block tồn tại, mặc định tắt; bật thử thì ẩn swap cho quốc gia cấu hình | I |

### R3: Task, điểm, Best pulls
| Mã | Ca | Kiểm |
|---|---|---|
| LAB-AC-049 | Điểm chỉ tăng qua task; ledger append-only; số dư = tổng ledger | I |
| LAB-AC-050 | Không endpoint mua, chuyển hay đổi điểm ra tiền; gọi thử bị từ chối | I |
| LAB-AC-051 | Swap không cộng điểm | I |
| LAB-AC-052 | Cấu hình task loại đăng bài X bị validator từ chối | U |
| LAB-AC-053 | Task "đang giữ tài sản" đọc on-chain, không giả được từ client | I |
| LAB-AC-054 | Mời bạn chỉ tính khi đạt điều kiện mục 9; tối đa 10/ngày | I |
| LAB-AC-055 | Một ví một tài khoản; tài khoản < 24h không đổi được điểm | I |
| LAB-AC-056 | Trừ điểm mở hòm là nguyên tử; 50 request song song không chi trùng | I |
| LAB-AC-057 | Best pulls tính % từ giá lúc pull; chỉ gồm roll thật; người dùng ẩn được mình | I+E |
| LAB-AC-058 | Rate limit trên endpoint task | I |

### R4: Hòm tài trợ
| Mã | Ca | Kiểm |
|---|---|---|
| LAB-AC-059 | Dự án đăng ký bằng ví, tạo campaign đủ trường mục 7.5 | E |
| LAB-AC-060 | Campaign chỉ chạy sau khi qua hidden gates và admin duyệt | I |
| LAB-AC-061 | Mọi nơi hiển thị tài sản tài trợ (thẻ, kết quả, ảnh chia sẻ, danh sách) có nhãn Sponsored; locale vi hiện "Quảng cáo · Sponsored" | E |
| LAB-AC-062 | Hòm tài trợ chỉ mở bằng điểm; hòm thường không chứa tài sản tài trợ trừ khi người dùng bật "hiện Sponsored" và vẫn có nhãn | I |
| LAB-AC-063 | Nạp token vào vault được xác minh bằng tx hash | I+M |
| LAB-AC-064 | Mỗi redemption gửi đúng số token một lần; lỗi mạng retry không gửi trùng | I |
| LAB-AC-065 | Vault hết token → campaign tự dừng, không nhận thêm lượt mở | I |
| LAB-AC-066 | Kết thúc campaign hoàn token còn lại cho dự án | I+M |
| LAB-AC-067 | Phí tài trợ được xác minh bằng tx hash tới ví treasury trước khi campaign chạy | I |
| LAB-AC-068 | Dashboard dự án đúng số liệu, xuất CSV | E |
| LAB-AC-069 | Kill switch gỡ coin khỏi mọi hòm và khoá swap ≤ 60 giây, ghi audit log | I |
| LAB-AC-070 | Mô tả campaign bị chặn nếu chứa ngôn từ hứa lợi nhuận (danh sách từ cấm) | U |

### R5: Mở rộng
| Mã | Ca | Kiểm |
|---|---|---|
| LAB-AC-071 | Chain mới chỉ bật khi đủ nguồn + gates + route swap (hoặc swap tắt) + test | I |
| LAB-AC-072 | Robinhood và Arc bật theo kết quả spike, swap qua aggregator hoặc router Uniswap | I+M |
| LAB-AC-073 | Hòm Meta dựng từ `/metas/trending/v1` | I |
| LAB-AC-074 | Hòm CTO dựng từ `/community-takeovers/latest/v1` | I |
| LAB-AC-075 | Hòm "Mới ra < 24h" dựng từ DexPaprika theo `created_at` | I |
| LAB-AC-076 | Giao diện en/vi đầy đủ | E |
| LAB-AC-077 | Roll p95 < 300 ms phía server; LCP trang Cases < 2,5 s trên 4G giả lập | I |

### R6: Launch
| Mã | Ca | Kiểm |
|---|---|---|
| LAB-AC-078 | Trang Terms, Privacy, Disclaimer, Sponsored policy có mặt và được link từ footer | E |
| LAB-AC-079 | `docs/LEGAL_CHECKLIST.md` được luật sư (người thật) xác nhận; agent không tự đánh dấu | M |
| LAB-AC-080 | Cảnh báo: ngân sách API > 80%, job trễ > 10 phút, tỷ lệ swap lỗi > 5% | I |
| LAB-AC-081 | Runbook: coin rug/kill switch, nguồn dữ liệu sập, lạm dụng điểm, tranh chấp tài trợ; mỗi runbook diễn tập một lần trên staging | M |
| LAB-AC-082 | Backup DB hằng ngày và thử khôi phục thành công | M |
| LAB-AC-083 | Tải thử 1.000 roll đồng thời không lỗi, p95 < 500 ms | I |
| LAB-AC-084 | Rà bảo mật: không giữ key, CSP, kiểm dependency, không lộ secret | M |
| LAB-AC-085 | Domain đã gửi xác minh với các ví lớn (Phantom, MetaMask/Blowfish…), có bằng chứng | M |
| LAB-AC-086 | Mọi điều cấm ở mục 0.4 có ca đã qua (bảng đối chiếu trong `BUILD_STATUS.md`) | M |
| LAB-AC-087 | Chủ sản phẩm duyệt bản staging cuối trước khi mở `LIVE` | M |
| LAB-AC-088 | Mọi phần tử FOMO (ticker, toast, "N ví đã mua", "last buy Xs ago", "last TOP pull") truy ngược được tới tx hash/proof thật trong DB; môi trường không có dữ liệu thật thì các phần tử này ẩn | I+E |
| LAB-AC-089 | Chart chỉ lấy từ widget nhúng DEX Screener/GeckoTerminal hoặc OHLCV DexPaprika (qua worker); widget lỗi/không có dữ liệu thì tự chuyển sang nguồn kế tiếp; không request nào tới endpoint nội bộ của dexscreener.com; khung thời gian chỉ hiện những khung nguồn hiện tại cho phép | I+E |

**Đối chiếu điều cấm → ca:** 0.4.1 → AC-028, 029 · 0.4.2 → AC-049, 050 · 0.4.3 → AC-052 · 0.4.4 → AC-009, 089 · 0.4.5 → AC-040, 041 ·
0.4.6 → AC-037, 043 · 0.4.7 → AC-028, 040 · 0.4.8 → AC-070 · 0.4.9 → AC-023 · 0.4.10 → AC-088.

---

## 13. Chỉ số theo dõi (chỉ đo trên LAB, không dùng API X)
- Roll/ngày, người dùng hoạt động ngày/tuần, tỷ lệ quay lại D1/D7.
- Tỷ lệ roll → swap; tỷ lệ swap thành công.
- Số campaign tài trợ, tỷ lệ dự án tài trợ lần hai, token phát ra.
- Số tài sản bị kill switch; thời gian từ phát hiện tới gỡ.
- Ngân sách API đã dùng theo nguồn.

---

## 14. Vận hành
- Môi trường: local, staging (mainnet số tiền nhỏ, chủ sản phẩm ký), production.
- Secrets: key DexPaprika, RPC, ví hot vault (giới hạn số dư, xoay định kỳ), DB.
- Ví hot vault chỉ ký giao dịch phát token theo redemption hợp lệ; có hạn mức mỗi giờ; vượt → dừng và cảnh báo.
- Runbook trong `docs/runbooks/`: rug/kill switch, nguồn sập, lạm dụng điểm, ví vault bất thường, tranh chấp tài trợ.

---

## 15. Prompt khởi động và tiếp quản

**Phiên đầu tiên:**
> Bạn là kỹ sư chính của Lockabox. Đọc toàn bộ `docs/LAB_MASTER.md`. Tạo `docs/BUILD_STATUS.md` liệt kê mọi `LAB-AC-###` ở
> trạng thái `SPEC`. Bắt đầu LAB-R0: dựng repo theo mục 5, sau đó làm spike và ghi `docs/spikes/R0.md`. Không bỏ qua điều cấm
> nào ở mục 0.4. Đọc tài liệu hiện hành của mọi API bên thứ ba trước khi tích hợp. Cuối phiên cập nhật `BUILD_STATUS.md` và
> `HANDOFF.md`.

**Phiên tiếp quản:**
> Đọc `docs/LAB_MASTER.md`, `docs/BUILD_STATUS.md`, `docs/HANDOFF.md`, `docs/DECISIONS.md`. Chạy lại test để xác nhận trạng
> thái. Tiếp tục phase đang dở, ưu tiên các ca còn `BUILT` chưa `VERIFIED_LOCAL`. Không đổi quyết định ở mục 2.1 khi chưa có
> chỉ thị của chủ sản phẩm.

---

## Nguồn đã tra (2026-09-26)
- DEX Screener API Terms: https://docs.dexscreener.com/api/api-terms-and-conditions
- DEX Screener API Reference: https://docs.dexscreener.com/api/reference
- DEX Screener WebSockets: https://docs.dexscreener.com/api/websockets.md
- DEX Screener Terms & Conditions: https://docs.dexscreener.com/privacy/terms-and-conditions.md
- DexPaprika rate limits: https://docs.dexpaprika.com/knowledge-base/rate-limits.md
- DexPaprika pool filtering: https://docs.dexpaprika.com/tutorials/pool-filtering.md
- X thông báo cấm app InfoFi: https://x.com/nikitabier/status/2011825522817270230
- Nghị quyết 05/2025/NQ-CP: https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-5-2025-nq-cp-ve-trien-khai-thi-diem-thi-truong-tai-san-ma-hoa-tai-viet-nam-119250909184045221.htm
- Luật Quảng cáo sửa đổi 2025 (KOL): https://thanhnien.vn/kol-koc-phai-xac-minh-thong-tin-neu-ro-rang-quang-cao-185251112111634136.htm

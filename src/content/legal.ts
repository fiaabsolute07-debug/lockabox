/**
 * Legal pages (LAB §9, AC-078). DRAFT written by the build agent from how the product actually works; it is not legal
 * advice and must be reviewed by a lawyer before LIVE (LAB §9 checklist). Owner fills `CONTACT` before launch.
 * Rendered by src/app/legal/[slug]/page.tsx; linked from the footer.
 */

export type Lang = 'en' | 'vi';
export type LegalDoc = { slug: LegalSlug; title: Record<Lang, string>; updated: string; status: 'draft' | 'reviewed'; sections: { h: Record<Lang, string>; p: Record<Lang, string[]> }[] };
export type LegalSlug = 'terms' | 'privacy' | 'disclaimer' | 'sponsored';

export const CONTACT = '[owner contact — fill before launch]';
const UPDATED = '2026-09-27';

export const LEGAL: LegalDoc[] = [
  {
    slug: 'terms', updated: UPDATED, status: 'draft',
    title: { en: 'Terms of use', vi: 'Điều khoản sử dụng' },
    sections: [
      { h: { en: 'What Lockabox is', vi: 'Lockabox là gì' }, p: {
        en: ['Lockabox shows a random token from public on-chain markets when you open a case. Opening a case is free and has no limit on the number of opens.', 'Lockabox does not sell tokens, does not hold your funds and does not trade for you. If you decide to buy, you sign the transaction in your own wallet, on a third-party exchange route.'],
        vi: ['Lockabox hiển thị ngẫu nhiên một token trên thị trường on-chain công khai khi bạn mở hòm. Mở hòm miễn phí và không giới hạn số lượt.', 'Lockabox không bán token, không giữ tiền của bạn và không giao dịch thay bạn. Nếu bạn quyết định mua, bạn tự ký giao dịch trong ví của mình, qua tuyến giao dịch của bên thứ ba.'] } },
      { h: { en: 'Who can use it', vi: 'Ai được sử dụng' }, p: {
        en: ['You must be 18 or older and allowed to use digital-asset services where you live. You are responsible for following the laws that apply to you.'],
        vi: ['Bạn phải đủ 18 tuổi và được phép sử dụng dịch vụ tài sản số tại nơi bạn sống. Bạn tự chịu trách nhiệm tuân thủ pháp luật áp dụng cho mình.'] } },
      { h: { en: 'No fee, no advice', vi: 'Không thu phí, không tư vấn' }, p: {
        en: ['Lockabox adds no fee to swaps. Network fees and the exchange route’s own costs still apply and are shown by your wallet.', 'A pull is a random pick, not a recommendation. Nothing on Lockabox is investment, financial, legal or tax advice.'],
        vi: ['Lockabox không cộng phí vào giao dịch swap. Phí mạng và chi phí của tuyến giao dịch vẫn áp dụng và được ví của bạn hiển thị.', 'Mỗi lần mở hòm là một lựa chọn ngẫu nhiên, không phải khuyến nghị. Không nội dung nào trên Lockabox là tư vấn đầu tư, tài chính, pháp lý hay thuế.'] } },
      { h: { en: 'Points', vi: 'Điểm' }, p: {
        en: ['Points are earned only by completing tasks. They cannot be bought, sold or transferred and have no cash value. They can be used to open sponsored cases.', 'We may hold or remove points gained through abuse (for example many accounts or automated activity).'],
        vi: ['Điểm chỉ có được khi hoàn thành nhiệm vụ. Điểm không mua, bán hay chuyển nhượng được và không có giá trị quy đổi tiền. Điểm dùng để mở hòm tài trợ.', 'Chúng tôi có thể giữ hoặc huỷ điểm có được do lạm dụng (ví dụ nhiều tài khoản hoặc hoạt động tự động).'] } },
      { h: { en: 'Third-party data and services', vi: 'Dữ liệu và dịch vụ bên thứ ba' }, p: {
        en: ['Market data comes from third parties (DEX Screener, DexPaprika, GeckoTerminal) and swap routes from Jupiter. It can be delayed, incomplete or wrong. Charts are embedded from their providers.'],
        vi: ['Dữ liệu thị trường đến từ bên thứ ba (DEX Screener, DexPaprika, GeckoTerminal) và tuyến swap từ Jupiter. Dữ liệu có thể chậm, thiếu hoặc sai. Biểu đồ được nhúng từ nhà cung cấp.'] } },
      { h: { en: 'Liability', vi: 'Trách nhiệm' }, p: {
        en: ['Lockabox is provided as is. To the extent the law allows, we are not liable for losses from trading, token prices, smart contracts, wallets or third-party services.'],
        vi: ['Lockabox được cung cấp theo hiện trạng. Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm về thua lỗ do giao dịch, giá token, hợp đồng thông minh, ví hoặc dịch vụ bên thứ ba.'] } },
      { h: { en: 'Changes and contact', vi: 'Thay đổi và liên hệ' }, p: {
        en: [`We may update these terms; the date at the top changes when we do. Contact: ${CONTACT}.`],
        vi: [`Chúng tôi có thể cập nhật điều khoản; ngày ở đầu trang sẽ thay đổi khi đó. Liên hệ: ${CONTACT}.`] } },
    ],
  },
  {
    slug: 'privacy', updated: UPDATED, status: 'draft',
    title: { en: 'Privacy', vi: 'Quyền riêng tư' },
    sections: [
      { h: { en: 'What we store', vi: 'Chúng tôi lưu gì' }, p: {
        en: ['A random device id in a cookie, so your rolls can be verified. If you sign in: your public wallet address and a session cookie. Two preference cookies: your language and that you confirmed you are 18 or older.', 'Your rolls (case, result, time) and swaps built through Lockabox (wallet address, amounts, transaction hash). Points and task completions.', 'We do not ask for your name, email or phone number, and we never see your private keys.'],
        vi: ['Một mã thiết bị ngẫu nhiên trong cookie để có thể kiểm chứng các lượt mở của bạn. Nếu bạn đăng nhập: địa chỉ ví công khai và cookie phiên. Hai cookie ghi nhớ lựa chọn: ngôn ngữ và việc bạn đã xác nhận đủ 18 tuổi.', 'Các lượt mở hòm (hòm, kết quả, thời gian) và giao dịch swap tạo qua Lockabox (địa chỉ ví, số lượng, mã giao dịch). Điểm và nhiệm vụ đã hoàn thành.', 'Chúng tôi không hỏi tên, email hay số điện thoại, và không bao giờ thấy khoá bí mật của bạn.'] } },
      { h: { en: 'What is public', vi: 'Thông tin công khai' }, p: {
        en: ['Recent pulls and buys made through Lockabox appear in the live feed and on Best pulls with a shortened wallet address. You can hide your wallet from Best pulls, the live feed and the buys table in settings. Blockchain transactions are public by nature.'],
        vi: ['Các lần mở hòm và lệnh mua gần đây qua Lockabox xuất hiện trong feed trực tiếp và bảng Lượt mở nổi bật với địa chỉ ví rút gọn. Bạn có thể ẩn ví khỏi bảng Lượt mở nổi bật, feed trực tiếp và bảng lệnh mua trong phần cài đặt. Giao dịch blockchain vốn công khai.'] } },
      { h: { en: 'Third parties', vi: 'Bên thứ ba' }, p: {
        en: ['Charts are embedded from DEX Screener or GeckoTerminal, which may set their own cookies. Your wallet talks to Solana RPC providers and Jupiter. We use no advertising trackers.', 'Your IP address is used briefly to limit request rates and is not stored with your account.'],
        vi: ['Biểu đồ được nhúng từ DEX Screener hoặc GeckoTerminal, các bên này có thể đặt cookie riêng. Ví của bạn kết nối với nhà cung cấp RPC Solana và Jupiter. Chúng tôi không dùng tracker quảng cáo.', 'Địa chỉ IP được dùng tạm thời để giới hạn tần suất truy cập và không lưu cùng tài khoản.'] } },
      { h: { en: 'Your choices', vi: 'Lựa chọn của bạn' }, p: {
        en: [`You can sign out at any time and clear cookies in your browser. To ask what we hold about your wallet, or to have it removed where the law allows, contact ${CONTACT}. Rolls are kept because they prove fairness to everyone.`],
        vi: [`Bạn có thể đăng xuất bất cứ lúc nào và xoá cookie trong trình duyệt. Để hỏi chúng tôi đang giữ gì về ví của bạn, hoặc yêu cầu xoá trong phạm vi pháp luật cho phép, liên hệ ${CONTACT}. Dữ liệu lượt mở được giữ lại vì nó chứng minh tính công bằng cho mọi người.`] } },
    ],
  },
  {
    slug: 'disclaimer', updated: UPDATED, status: 'draft',
    title: { en: 'Disclaimer', vi: 'Tuyên bố miễn trừ' },
    sections: [
      { h: { en: 'Random pick, not advice', vi: 'Chọn ngẫu nhiên, không phải lời khuyên' }, p: {
        en: ['Every pull is chosen at random from a pool of tokens that are trading on public markets. Being in a case says nothing about a token’s quality or future.', 'Tiers (Micro, Small, Mid, Large, Top) are market-cap buckets only. A higher tier is not safer and not a better pick.'],
        vi: ['Mỗi lần mở hòm được chọn ngẫu nhiên từ nhóm token đang giao dịch trên thị trường công khai. Có mặt trong hòm không nói lên chất lượng hay tương lai của token.', 'Các hạng (Micro, Small, Mid, Large, Top) chỉ là nhóm vốn hoá. Hạng cao hơn không an toàn hơn và không phải lựa chọn tốt hơn.'] } },
      { h: { en: 'Memecoins can go to zero', vi: 'Memecoin có thể về 0' }, p: {
        en: ['Memecoins are extremely volatile. You can lose everything you put in. Only use money you can afford to lose.', 'Lockabox removes some tokens automatically (for example when a test sale fails or liquidity is almost zero). These checks are limited and are not a guarantee.'],
        vi: ['Memecoin biến động cực mạnh. Bạn có thể mất toàn bộ số tiền bỏ vào. Chỉ dùng số tiền bạn chấp nhận mất.', 'Lockabox tự động loại một số token (ví dụ khi bán thử thất bại hoặc thanh khoản gần bằng 0). Các kiểm tra này có giới hạn và không phải là bảo đảm.'] } },
      { h: { en: 'Provably fair', vi: 'Công bằng kiểm chứng được' }, p: {
        en: ['Each roll is decided by a server seed committed in advance, your client seed and a nonce. After the seed is revealed you can recompute any roll on the Verify page.'],
        vi: ['Mỗi lượt mở được quyết định bởi server seed đã cam kết trước, client seed của bạn và nonce. Sau khi seed được công bố, bạn có thể tự tính lại bất kỳ lượt mở nào ở trang Kiểm chứng.'] } },
    ],
  },
  {
    slug: 'sponsored', updated: UPDATED, status: 'draft',
    title: { en: 'Sponsored policy', vi: 'Chính sách tài trợ' },
    sections: [
      { h: { en: 'How sponsorship works', vi: 'Tài trợ hoạt động thế nào' }, p: {
        en: ['Projects pay Lockabox to put their token in the sponsored case and fund a token drop. Sponsored tokens are always labelled “Sponsored” (Vietnamese: “Quảng cáo · Sponsored”) wherever they appear.', 'The sponsored case is opened with points only. Free cases never contain paid placements.'],
        vi: ['Dự án trả phí cho Lockabox để đưa token vào hòm tài trợ và cấp token để phát. Token tài trợ luôn có nhãn “Quảng cáo · Sponsored” ở mọi nơi hiển thị.', 'Hòm tài trợ chỉ mở bằng điểm. Hòm miễn phí không bao giờ chứa vị trí trả phí.'] } },
      { h: { en: 'What sponsors can’t do', vi: 'Nhà tài trợ không được làm gì' }, p: {
        en: ['Sponsors cannot buy a higher tier: a sponsored token shows its real market-cap tier. Descriptions may not promise returns, price moves or profit.', 'Every campaign is reviewed before it goes live, must pass the same automatic checks as other tokens, and can be removed at any time.'],
        vi: ['Nhà tài trợ không mua được hạng cao hơn: token tài trợ hiển thị đúng hạng vốn hoá thật. Mô tả không được hứa lợi nhuận, biến động giá hay lãi.', 'Mọi chiến dịch được duyệt trước khi chạy, phải qua cùng các kiểm tra tự động như token khác, và có thể bị gỡ bất cứ lúc nào.'] } },
      { h: { en: 'Contact', vi: 'Liên hệ' }, p: {
        en: [`Sponsorship questions and reports: ${CONTACT}.`],
        vi: [`Câu hỏi về tài trợ và báo cáo vi phạm: ${CONTACT}.`] } },
    ],
  },
];

export function legalDoc(slug: string): LegalDoc | undefined {
  return LEGAL.find((d) => d.slug === slug);
}

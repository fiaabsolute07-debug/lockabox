/**
 * Legal pages (LAB §9, AC-078). DRAFT written by the build agent from how the product actually works; it is not legal
 * advice and must be reviewed by a lawyer before LIVE (LAB §9 checklist). Owner fills `CONTACT` before launch.
 * Rendered by src/app/legal/[slug]/page.tsx; linked from the footer.
 */

export type Lang = 'en';
export type LegalDoc = { slug: LegalSlug; title: Record<Lang, string>; updated: string; status: 'draft' | 'reviewed'; sections: { h: Record<Lang, string>; p: Record<Lang, string[]> }[] };
export type LegalSlug = 'terms' | 'privacy' | 'disclaimer' | 'sponsored';

export const CONTACT = '[owner contact — fill before launch]';
const UPDATED = '2026-09-27';

export const LEGAL: LegalDoc[] = [
  {
    slug: 'terms', updated: UPDATED, status: 'draft',
    title: { en: 'Terms of use' },
    sections: [
      { h: { en: 'What Lockabox is' }, p: {
        en: ['Lockabox shows a random token from public on-chain markets when you open a case. Opening a case is free and has no limit on the number of opens.', 'Lockabox does not sell tokens, does not hold your funds and does not trade for you. If you decide to buy, you sign the transaction in your own wallet, on a third-party exchange route.'] } },
      { h: { en: 'Who can use it' }, p: {
        en: ['You must be 18 or older and allowed to use digital-asset services where you live. You are responsible for following the laws that apply to you.'] } },
      { h: { en: 'No fee, no advice' }, p: {
        en: ['Lockabox adds no fee to swaps. Network fees and the exchange route’s own costs still apply and are shown by your wallet.', 'A pull is a random pick, not a recommendation. Nothing on Lockabox is investment, financial, legal or tax advice.'] } },
      { h: { en: 'Points' }, p: {
        en: ['Points are earned only by completing tasks. They cannot be bought, sold or transferred and have no cash value. They can be used to open sponsored cases.', 'We may hold or remove points gained through abuse (for example many accounts or automated activity).'] } },
      { h: { en: 'Third-party data and services' }, p: {
        en: ['Market data comes from third parties (DEX Screener, DexPaprika, GeckoTerminal) and swap routes from Jupiter. It can be delayed, incomplete or wrong. Charts are embedded from their providers.'] } },
      { h: { en: 'Liability' }, p: {
        en: ['Lockabox is provided as is. To the extent the law allows, we are not liable for losses from trading, token prices, smart contracts, wallets or third-party services.'] } },
      { h: { en: 'Changes and contact' }, p: {
        en: [`We may update these terms; the date at the top changes when we do. Contact: ${CONTACT}.`] } },
    ],
  },
  {
    slug: 'privacy', updated: UPDATED, status: 'draft',
    title: { en: 'Privacy' },
    sections: [
      { h: { en: 'What we store' }, p: {
        en: ['A random device id in a cookie, so your rolls can be verified. If you sign in: your public wallet address and a session cookie. Two preference cookies: your language and that you confirmed you are 18 or older.', 'Your rolls (case, result, time) and swaps built through Lockabox (wallet address, amounts, transaction hash). Points and task completions.', 'We do not ask for your name, email or phone number, and we never see your private keys.'] } },
      { h: { en: 'What is public' }, p: {
        en: ['Recent pulls and buys made through Lockabox appear in the live feed and on Best pulls with a shortened wallet address. You can hide your wallet from Best pulls, the live feed and the buys table in settings. Blockchain transactions are public by nature.'] } },
      { h: { en: 'Third parties' }, p: {
        en: ['Charts are embedded from DEX Screener or GeckoTerminal, which may set their own cookies. Your wallet talks to Solana RPC providers and Jupiter. We use no advertising trackers.', 'Your IP address is used briefly to limit request rates and is not stored with your account.'] } },
      { h: { en: 'Your choices' }, p: {
        en: [`You can sign out at any time and clear cookies in your browser. To ask what we hold about your wallet, or to have it removed where the law allows, contact ${CONTACT}. Rolls are kept because they prove fairness to everyone.`] } },
    ],
  },
  {
    slug: 'disclaimer', updated: UPDATED, status: 'draft',
    title: { en: 'Disclaimer' },
    sections: [
      { h: { en: 'Random pick, not advice' }, p: {
        en: ['Every pull is chosen at random from a pool of tokens that are trading on public markets. Being in a case says nothing about a token’s quality or future.', 'Tiers (Micro, Small, Mid, Large, Top) are market-cap buckets only. A higher tier is not safer and not a better pick.'] } },
      { h: { en: 'Memecoins can go to zero' }, p: {
        en: ['Memecoins are extremely volatile. You can lose everything you put in. Only use money you can afford to lose.', 'Lockabox removes some tokens automatically (for example when a test sale fails or liquidity is almost zero). These checks are limited and are not a guarantee.'] } },
      { h: { en: 'Provably fair' }, p: {
        en: ['Each roll is decided by a server seed committed in advance, your client seed and a nonce. After the seed is revealed you can recompute any roll on the Verify page.'] } },
    ],
  },
  {
    slug: 'sponsored', updated: UPDATED, status: 'draft',
    title: { en: 'Sponsored policy' },
    sections: [
      { h: { en: 'How sponsorship works' }, p: {
        en: ['Projects pay Lockabox to put their token in the sponsored case and fund a token drop. Sponsored tokens are always labelled “Sponsored” wherever they appear.', 'The sponsored case is opened with points only. Free cases never contain paid placements.'] } },
      { h: { en: 'What sponsors can’t do' }, p: {
        en: ['Sponsors cannot buy a higher tier: a sponsored token shows its real market-cap tier. Descriptions may not promise returns, price moves or profit.', 'Every campaign is reviewed before it goes live, must pass the same automatic checks as other tokens, and can be removed at any time.'] } },
      { h: { en: 'Contact' }, p: {
        en: [`Sponsorship questions and reports: ${CONTACT}.`] } },
    ],
  },
];

export function legalDoc(slug: string): LegalDoc | undefined {
  return LEGAL.find((d) => d.slug === slug);
}

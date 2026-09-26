# Draft for the owner to send (LAB-AC-012). Claude has not sent anything.

**To:** DEX Screener (contact form / Discord listed at docs.dexscreener.com)
**Subject:** Confirming our use of the DEX Screener API and chart embed (Lockabox)

Hi DEX Screener team,

We're building Lockabox (lockabox.fun), a site where users open a free "case" that suggests a random memecoin, then decide whether to buy it from their own wallet. We'd like to confirm our use is fine with you:

1. **API:** a single server-side worker polls your public endpoints (token profiles, boosts, community takeovers, metas every minute; `/tokens/v1` in batches of 30 for prices, well under your published limits). We cache the results and never call you per user request. We don't resell or re-expose your data through our own API.
2. **Chart embed:** on each coin page we embed your chart with `https://dexscreener.com/{chain}/{pair}?embed=1&theme=dark&trades=0&info=0`, keeping your "Tracked by DEX Screener" footer. We link back to your pair page and don't use your logo as ours.
3. We are not building a screener or a competing product: no rankings, no search over your data.

Is this within your terms? If you'd prefer we use a paid plan for the API, could you share the options and limits?

Thanks,
<owner name>, Lockabox

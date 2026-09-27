'use client';

import type { LegalDoc } from '@/content/legal';
import { useT } from './i18n';

export default function LegalDocument({ doc }: { doc: LegalDoc }) {
  const { t, date } = useT();
  const language = 'en' as const;
  return <main className="simple-page legal-page"><article className="simple-card panel"><span className="eyebrow">{t('legalEyebrow')}</span><h1>{doc.title[language]}</h1><p className="legal-updated">{t('lastUpdated', { date: date(doc.updated) })}</p>{doc.status === 'draft' && <div className="legal-draft" role="note">{t('draftPending')}</div>}<div className="legal-sections">{doc.sections.map((section) => <section key={section.h.en}><h2>{section.h[language]}</h2>{section.p[language].map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}</div></article></main>;
}

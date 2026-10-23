"use client";

import { useState } from "react";
import { apiDownload } from "@/lib/api";
import { Badge, Button, Card, CardHead, EmptyState, Icon, PageHeader, useToast } from "@/components/ui";
import { PortalPage, type PortalChild } from "@/components/portal/PortalContext";
import { useChildData } from "@/components/portal/useChildData";
import { PanelState, fmtDay } from "@/components/portal/bits";

type Marks = {
  exams: {
    exam_id: string;
    exam_name: string;
    date: string;
    term: string | null;
    academic_year: string | null;
    subjects: { subject: string; code: string; score: number; max_score: number; pct: number | null; grade: string | null }[];
    total: number;
    max_total: number;
    pct: number | null;
    grade: string | null;
  }[];
  /** Report cards the school has PUBLISHED (frozen per term), newest first. */
  report_cards: PublishedCard[];
  /** Latest published card's PDF, or null until a term is published. */
  report_card_url: string | null;
};

type PublishedCard = {
  term: string; academic_year: string; published_at: string;
  overall_pct: number | null; overall_grade: string | null; grade_point: number | null;
  rank: number | null; class_size: number | null; passed: boolean | null; pdf_url: string;
};

function ResultsBody({ child }: { child: PortalChild }) {
  const toast = useToast();
  const { data, error, loading, reload } = useChildData<Marks>(child.id, "marks");
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (c: PublishedCard) => {
    setDownloading(c.pdf_url);
    try {
      await apiDownload(c.pdf_url, `report-card-${child.admission_no}-${c.term}-${c.academic_year}.pdf`.replace(/\s+/g, "-"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      const notReady = /not been published|not found/i.test(msg);
      toast.push(notReady ? "This report card isn't published yet. Please check back later." : msg, notReady ? "info" : "error");
    } finally {
      setDownloading(null);
    }
  };

  const cards = data?.report_cards ?? [];

  return (
    <>
      <PanelState loading={loading} error={error} reload={reload} />
      {data && (
        <Card>
          <CardHead
            icon="file"
            title="Report cards"
            subtitle="Issued by the school at the end of each term. A published card does not change afterwards."
          />
          {cards.length === 0 ? (
            <EmptyState icon="file" title="No report card published yet" hint="The school publishes report cards at the end of each term; they will appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {cards.map((c) => (
                <li key={`${c.term}|${c.academic_year}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div>
                    <p className="font-semibold text-ink">{c.term} · {c.academic_year}</p>
                    <p className="text-[12.5px] text-ink-3">Published {fmtDay(c.published_at.slice(0, 10))}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold tnum text-ink">{c.overall_pct == null ? "—" : `${c.overall_pct.toFixed(1)}%`}</span>
                    {c.overall_grade && <Badge tone="brand">{c.overall_grade}</Badge>}
                    {c.rank != null && <Badge tone="sky">Rank {c.rank}{c.class_size ? ` of ${c.class_size}` : ""}</Badge>}
                    {c.passed != null && <Badge tone={c.passed ? "emerald" : "rose"}>{c.passed ? "Pass" : "Below pass mark"}</Badge>}
                    <Button size="sm" variant="primary" onClick={() => download(c)} loading={downloading === c.pdf_url}>
                      <Icon name="download" className="h-3.5 w-3.5" />
                      PDF
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {data && data.exams.length === 0 && (
        <Card><EmptyState icon="exams" title="No marks yet" hint="Marks appear here once teachers enter them." /></Card>
      )}
      {data?.exams.map((e) => (
        <Card key={e.exam_id}>
          <CardHead
            icon="exams"
            title={e.exam_name}
            subtitle={[fmtDay(e.date), e.term, e.academic_year].filter(Boolean).join(" · ")}
            actions={
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-bold tnum text-ink">{e.pct == null ? "—" : `${e.pct.toFixed(1)}%`}</span>
                {e.grade && <Badge tone="brand">{e.grade}</Badge>}
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 0 }}>
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-2 text-left sm:px-5">Subject</th>
                  <th className="px-3 py-2 text-right">Marks</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-4 py-2 text-right sm:px-5">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {e.subjects.map((s) => (
                  <tr key={s.code}>
                    <td className="px-4 py-2.5 font-medium text-ink sm:px-5">{s.subject}</td>
                    <td className="px-3 py-2.5 text-right tnum text-ink-2">{s.score}/{s.max_score}</td>
                    <td className="px-3 py-2.5 text-right tnum text-ink-2">{s.pct == null ? "—" : s.pct.toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-ink sm:px-5">{s.grade ?? "—"}</td>
                  </tr>
                ))}
                <tr className="bg-surface-2">
                  <td className="px-4 py-2.5 font-bold text-ink sm:px-5">Total</td>
                  <td className="px-3 py-2.5 text-right font-bold tnum text-ink">{e.total}/{e.max_total}</td>
                  <td className="px-3 py-2.5 text-right font-bold tnum text-ink">{e.pct == null ? "—" : e.pct.toFixed(0)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-ink sm:px-5">{e.grade ?? "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </>
  );
}

export default function PortalResultsPage() {
  return (
    <div className="space-y-4">
      <PageHeader icon="exams" title="Results & report cards" subtitle="Published term report cards, and marks for every exam by subject." />
      <PortalPage>{(child) => <ResultsBody key={child.id} child={child} />}</PortalPage>
    </div>
  );
}

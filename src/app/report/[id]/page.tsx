import type { Metadata } from "next";
import ReportClient from "@/components/report/ReportClient";

export const metadata: Metadata = {
  title: "Your Free SEO Audit Report | MSScore",
  robots: { index: false, follow: false },
};

export default async function ReportPage(props: PageProps<"/report/[id]">) {
  const { id } = await props.params;
  return <ReportClient id={id} />;
}

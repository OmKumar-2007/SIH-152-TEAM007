import { redirect } from "next/navigation";

/**
 * Segments now lives inside Audience.
 *
 * Kept as a redirect rather than deleted: the path may be bookmarked, and
 * landing on a 404 is a worse answer than landing on the view that replaced it.
 */
export default function SegmentsPage() {
  redirect("/audience?view=segments");
}

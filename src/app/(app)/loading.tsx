import { BoardSkeleton } from "@/components/skeleton";

// Shown the instant a tab is tapped, and prefetched with every link, while the server reads the household's data.
export default function Loading() {
  return (
    <>
      <header className="page-head" aria-hidden>
        <div className="sk-head"><span className="sk sk-line-sm" /><span className="sk sk-line-lg" /></div>
      </header>
      <BoardSkeleton />
    </>
  );
}

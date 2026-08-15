import { Skeleton } from "@/components/ui/skeleton";

interface LoadingSkeletonProps {
  variant: "table" | "card-grid" | "list" | "editor";
}

function TableSkeleton() {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex gap-4 p-4 border-b">
        <Skeleton className="h-4 w-[20%]" />
        <Skeleton className="h-4 w-[15%]" />
        <Skeleton className="h-4 w-[12%]" />
        <Skeleton className="h-4 w-[15%]" />
        <Skeleton className="h-4 w-[20%]" />
        <Skeleton className="h-4 w-[10%]" />
      </div>
      {/* Rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 p-4 border-b last:border-b-0">
          <Skeleton className="h-4 w-[20%]" />
          <Skeleton className="h-4 w-[15%]" />
          <Skeleton className="h-4 w-[12%]" />
          <Skeleton className="h-4 w-[15%]" />
          <Skeleton className="h-4 w-[20%]" />
          <Skeleton className="h-4 w-[10%]" />
        </div>
      ))}
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-5 space-y-3">
          <div className="flex items-start justify-between">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-3/4 mt-3" />
          <div className="flex gap-2 mt-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="flex gap-1 mt-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-18 rounded-full" />
          </div>
          <div className="border-t pt-3 mt-3">
            <div className="flex justify-end gap-1">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-7 w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
          <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-4">
      {/* Title bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      {/* Tabs */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      {/* Content area */}
      <Skeleton className="h-[400px] w-full rounded-lg" />
    </div>
  );
}

export function LoadingSkeleton({ variant }: LoadingSkeletonProps) {
  switch (variant) {
    case "table":
      return <TableSkeleton />;
    case "card-grid":
      return <CardGridSkeleton />;
    case "list":
      return <ListSkeleton />;
    case "editor":
      return <EditorSkeleton />;
  }
}

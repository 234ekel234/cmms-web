import Link from "next/link";

export type Crumb = { label: string; href?: string };

// Consistent breadcrumb trail for detail pages. The last item renders as the
// current page (non-link); earlier items with an href are clickable ancestors.
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center flex-wrap gap-1.5 text-xs text-gray-400">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-[#2166AC] transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "text-gray-600 font-medium" : undefined} aria-current={isLast ? "page" : undefined}>
                  {item.label}
                </span>
              )}
              {!isLast && <span aria-hidden="true" className="text-gray-300">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

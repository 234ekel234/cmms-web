import Link from "next/link";
import { type AssetLocationRef, PATH_SEPARATOR } from "@/lib/assetLocations";

/**
 * Where something is filed, as links to the location pages: the building opens
 * the building's page (which includes its floors), the floor opens the floor's.
 * Renders `fallback` when nothing is filed.
 */
export default function LocationLink({
  accountId,
  location,
  className = "hover:underline",
  fallback = null,
}: {
  accountId: string;
  location: AssetLocationRef | null | undefined;
  className?: string;
  fallback?: React.ReactNode;
}) {
  if (!location) return <>{fallback}</>;
  const href = (id: string) => `/accounts/${accountId}/assets/locations/${id}`;
  return (
    <span>
      {location.parent && (
        <>
          <Link href={href(location.parent.id)} className={className}>{location.parent.name}</Link>
          {PATH_SEPARATOR}
        </>
      )}
      <Link href={href(location.id)} className={className}>{location.name}</Link>
    </span>
  );
}

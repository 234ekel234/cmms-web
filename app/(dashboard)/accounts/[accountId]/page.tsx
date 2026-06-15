import { redirect } from "next/navigation";

export default function AccountDetailRootPage({ params }: { params: { accountId: string } }) {
  redirect(`/accounts/${params.accountId}/work-orders`);
}

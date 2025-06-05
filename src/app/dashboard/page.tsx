import { createClient } from "../../../supabase/server";
import { redirect } from "next/navigation";
import { SubscriptionCheck } from "@/components/subscription-check";
import { getUserSubscription } from "@/app/actions";
import ChatInterface from "@/components/chat-interface";

export default async function Dashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  const subscription = await getUserSubscription(user.id);

  return (
    <SubscriptionCheck>
      <main className="w-full h-screen">
        <ChatInterface user={user} subscription={subscription} />
      </main>
    </SubscriptionCheck>
  );
}

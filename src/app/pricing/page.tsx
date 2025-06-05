import Navbar from "@/components/navbar";
import PricingCard from "@/components/pricing-card";
import { createClient } from "../../../supabase/server";
import { getUserSubscription } from "../actions";

export default async function Pricing() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: plans, error } = await supabase.functions.invoke(
    "supabase-functions-get-plans",
  );

  const currentSubscription = user ? await getUserSubscription(user.id) : null;

  // Add basic plan to the pricing options
  const basicPlan = {
    id: 'basic_plan',
    name: 'Basic',
    amount: 0,
    interval: 'month',
    currency: 'usd',
    popular: false
  };

  // Combine basic plan with Stripe plans
  const allPlans = [basicPlan, ...(plans || [])];

  return (
    <>
      <Navbar />
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-muted-foreground">
            Choose the perfect plan for your email management needs
          </p>
          {currentSubscription && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 max-w-md mx-auto">
              <p className="text-blue-900 font-medium">
                Current plan: {currentSubscription.price_id === 'basic_plan' ? 'Basic (Free)' : 'Premium'}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {allPlans?.map((item: any) => (
            <PricingCard 
              key={item.id} 
              item={item} 
              user={user} 
              currentSubscription={currentSubscription}
            />
          ))}
        </div>
      </div>
    </>
  );
}

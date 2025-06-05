"use client";

import { User } from "@supabase/supabase-js";
import { Button } from "./ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { supabase } from "../../supabase/supabase";

export default function PricingCard({
  item,
  user,
  currentSubscription,
}: {
  item: any;
  user: User | null;
  currentSubscription?: any;
}) {
  // Handle checkout process
  const handleCheckout = async (priceId: string) => {
    if (!user) {
      // Redirect to login if user is not authenticated
      window.location.href = "/login?redirect=pricing";
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke(
        "supabase-functions-create-checkout",
        {
          body: {
            price_id: priceId,
            user_id: user.id,
            return_url: `${window.location.origin}/dashboard`,
          },
          headers: {
            "X-Customer-Email": user.email || "",
          },
        },
      );

      if (error) {
        throw error;
      }

      // Redirect to Stripe checkout
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
    }
  };

  // Check if this is the user's current plan
  const isCurrentPlan = currentSubscription?.price_id === item.id || 
    (currentSubscription?.price_id === 'basic_plan' && item.name === 'Basic');

  // Check if user has basic plan and this is a paid plan (upgrade scenario)
  const isUpgrade = currentSubscription?.price_id === 'basic_plan' && item.name !== 'Basic';

  return (
    <Card
      className={`w-[350px] relative overflow-hidden ${
        item.popular ? "border-2 border-blue-500 shadow-xl scale-105" : 
        isCurrentPlan ? "border-2 border-green-500" : "border border-gray-200"
      } bg-white`}
    >
      {item.popular && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 opacity-30" />
      )}
      {isCurrentPlan && (
        <div className="absolute inset-0 bg-gradient-to-br from-green-50 via-white to-green-50 opacity-30" />
      )}
      <CardHeader className="relative">
        {item.popular && (
          <div className="px-4 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-full w-fit mb-4">
            Most Popular
          </div>
        )}
        {isCurrentPlan && (
          <div className="px-4 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-green-600 to-green-700 rounded-full w-fit mb-4">
            Current Plan
          </div>
        )}
        <CardTitle className="text-2xl font-bold tracking-tight text-gray-900">
          {item.name}
        </CardTitle>
        <CardDescription className="flex items-baseline gap-2 mt-2">
          <span className="text-4xl font-bold text-gray-900">
            {item.name === 'Basic' ? '$0' : `$${(item?.amount / 100).toFixed(2)}`}
          </span>
          <span className="text-gray-600">
            {item.name === 'Basic' ? '/forever' : `/${item?.interval}`}
          </span>
        </CardDescription>
        <div className="mt-4 space-y-2">
          <p className="text-sm text-gray-600">Perfect for:</p>
          <ul className="text-sm text-gray-600 space-y-1">
            {item.name === "Basic" && (
              <>
                <li>• Up to 1,000 emails/month</li>
                <li>• Gmail integration</li>
                <li>• Basic AI summarization</li>
              </>
            )}
            {item.name === "Pro" && (
              <>
                <li>• Up to 10,000 emails/month</li>
                <li>• Gmail & Microsoft integration</li>
                <li>• Advanced AI features</li>
                <li>• Priority support</li>
              </>
            )}
            {item.name === "Enterprise" && (
              <>
                <li>• Unlimited emails</li>
                <li>• All integrations</li>
                <li>• Custom AI models</li>
                <li>• Dedicated support</li>
              </>
            )}
          </ul>
        </div>
      </CardHeader>
      <CardFooter className="relative">
        {isCurrentPlan ? (
          <Button disabled className="w-full py-6 text-lg font-medium">
            Current Plan
          </Button>
        ) : item.name === 'Basic' ? (
          <Button disabled className="w-full py-6 text-lg font-medium" variant="outline">
            Free Plan
          </Button>
        ) : (
          <Button
            onClick={async () => {
              await handleCheckout(item.id);
            }}
            className={`w-full py-6 text-lg font-medium ${
              isUpgrade ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800' : ''
            }`}
          >
            {isUpgrade ? 'Upgrade Now' : 'Get Started'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

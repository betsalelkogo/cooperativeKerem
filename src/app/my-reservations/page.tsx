import { Suspense } from "react";
import MyReservationsPage from "./MyReservationsContent";
import { ActivityLoading } from "@/components/my-activity/ActivityCards";

export default function Page() {
  return (
    <Suspense fallback={<ActivityLoading />}>
      <MyReservationsPage />
    </Suspense>
  );
}

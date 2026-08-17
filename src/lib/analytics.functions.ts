import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  buildAnalyticsCsv,
  loadAnalyticsActivity,
  loadAnalyticsStats,
  loadOperatorNotifications,
  setOperatorNotificationRead,
} from "./analytics.server";

const periodSchema = z.object({
  period: z.enum(["today", "24h", "7d", "30d"]).default("today"),
});

export const getAnalyticsStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => periodSchema.parse(data))
  .handler(({ data, context }) => loadAnalyticsStats(context, data.period));

export const getAnalyticsActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => periodSchema.parse(data))
  .handler(({ data, context }) => loadAnalyticsActivity(context, data.period));

export const exportAnalyticsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => periodSchema.parse(data))
  .handler(({ data, context }) => buildAnalyticsCsv(context, data.period));

export const getOperatorNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) => loadOperatorNotifications(context));

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(({ data, context }) => setOperatorNotificationRead(context, data.id));

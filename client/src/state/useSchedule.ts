import type { ScheduledSessionDto } from "@studyroom/core";
import { useEffect, useState } from "react";
import type { StudyRoomGateway } from "../api/gateway";

/** Upcoming scheduled sessions, kept live by the server's pushes. */
export function useSchedule(gateway: StudyRoomGateway) {
  const [sessions, setSessions] = useState<ScheduledSessionDto[]>([]);
  useEffect(() => {
    let cancelled = false;
    gateway
      .getSchedule()
      .then((list) => !cancelled && setSessions(list))
      .catch(() => {});
    const off = gateway.onScheduleUpdated(setSessions);
    return () => {
      cancelled = true;
      off();
    };
  }, [gateway]);
  // Drop sessions once they start, without waiting for the server.
  const now = gateway.now();
  return { sessions: sessions.filter((s) => s.startsAtMs > now), setSessions };
}

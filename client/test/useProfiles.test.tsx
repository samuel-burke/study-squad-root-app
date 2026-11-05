import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudyRoomGateway } from "../src/api/gateway";
import { PROFILE_RETRY_MS, useProfiles } from "../src/state/useProfiles";

afterEach(() => vi.useRealTimers());

describe("useProfiles", () => {
  it("asks Root again after a failed lookup instead of leaving members blank", async () => {
    vi.useFakeTimers();
    const getProfiles = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([{ userId: "ana", name: "Ana" }]);
    const gateway = { getProfiles } as unknown as StudyRoomGateway;
    const ids = ["ana"];
    const { result } = renderHook(() => useProfiles(gateway, ids));

    await act(async () => {});
    expect(getProfiles).toHaveBeenCalledTimes(1);
    expect(result.current.get("ana")).toBeUndefined();

    await act(async () => {
      vi.advanceTimersByTime(PROFILE_RETRY_MS);
    });
    expect(getProfiles).toHaveBeenCalledTimes(2);
    expect(result.current.get("ana")?.name).toBe("Ana");
  });
});

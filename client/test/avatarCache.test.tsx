import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Avatar } from "../src/components/Avatar";
import { cachedAvatar, saveAvatar } from "../src/lib/avatarCache";

const COPY = "data:image/jpeg;base64,COPY";
const KEY = "studysquad.avatar.";

describe("avatar cache", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  const ana = { userId: "ana", name: "Ana Lee", avatarUrl: "https://cdn.test/ana.png" };

  function avatarStyle(container: HTMLElement) {
    return container.querySelector(".avatar")!.getAttribute("style") ?? "";
  }

  it("shows the last saved copy instead of initials when the picture fails", () => {
    window.localStorage.setItem(KEY + "ana", COPY);
    const { container } = render(<Avatar userId="ana" profile={ana} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container).not.toHaveTextContent("AL");
    expect(avatarStyle(container)).toContain(COPY);
  });

  it("shows the saved copy while the profile is still loading", () => {
    window.localStorage.setItem(KEY + "ana", COPY);
    const { container } = render(<Avatar userId="ana" />);
    expect(avatarStyle(container)).toContain(COPY);
  });

  it("drops the saved copy once someone removes their picture", () => {
    window.localStorage.setItem(KEY + "ana", COPY);
    const { container } = render(
      <Avatar userId="ana" profile={{ userId: "ana", name: "Ana Lee" }} />,
    );
    expect(avatarStyle(container)).not.toContain(COPY);
    expect(container).toHaveTextContent("AL");
  });

  it("falls back to initials when nothing was saved", () => {
    const { container } = render(<Avatar userId="ana" profile={ana} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container).toHaveTextContent("AL");
  });

  describe("saving", () => {
    let loads: { img: FakeImage }[] = [];
    class FakeImage {
      crossOrigin = "";
      src = "";
      naturalWidth = 200;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      constructor() {
        loads.push({ img: this });
      }
    }
    const draw = vi.fn();

    beforeEach(() => {
      loads = [];
      draw.mockClear();
      vi.stubGlobal("Image", FakeImage);
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        fillRect: vi.fn(),
        drawImage: draw,
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(COPY);
    });
    afterEach(() => vi.restoreAllMocks());

    it("saves a square copy of a picture that loaded, asking for CORS", () => {
      saveAvatar("bo", "https://cdn.test/bo.png", "#123");
      expect(loads).toHaveLength(1);
      const { img } = loads[0]!;
      expect(img.crossOrigin).toBe("anonymous");
      expect(img.src).toBe("https://cdn.test/bo.png");
      img.onload!();
      // Center crop of a 200x100 picture.
      expect(draw).toHaveBeenCalledWith(img, 50, 0, 100, 100, 0, 0, 96, 96);
      expect(cachedAvatar("bo")).toBe(COPY);
    });

    it("saves each member once per visit", () => {
      saveAvatar("cy", "https://cdn.test/cy.png", "#123");
      saveAvatar("cy", "https://cdn.test/cy.png", "#123");
      expect(loads).toHaveLength(1);
    });

    it("saves nothing when the server refuses CORS (tainted canvas)", () => {
      vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
        throw new DOMException("tainted", "SecurityError");
      });
      saveAvatar("di", "https://cdn.test/di.png", "#123");
      loads[0]!.img.onload!();
      expect(cachedAvatar("di")).toBeUndefined();
    });

    it("starts saving when the live picture loads", () => {
      const { container } = render(<Avatar userId="ed" profile={{ ...ana, userId: "ed" }} />);
      fireEvent.load(container.querySelector("img")!);
      loads[0]!.img.onload!();
      expect(cachedAvatar("ed")).toBe(COPY);
    });
  });
});

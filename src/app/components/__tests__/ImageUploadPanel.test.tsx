import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImageUploadPanel } from "../ImageUploadPanel";

describe("ImageUploadPanel", () => {
  it("shows preview and calls onSend when a file is selected", async () => {
    const onSend = vi.fn().mockResolvedValue({});
    render(<ImageUploadPanel onSend={onSend} />);

    const file = new File([Buffer.from("image")], "photo.png", { type: "image/png" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("photo.png")).toBeTruthy();

    const sendButton = screen.getByTestId("send-image-button");
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(file, undefined);
    });
  });

  it("rejects oversized files on selection", () => {
    const onSend = vi.fn();
    render(<ImageUploadPanel onSend={onSend} maxSizeBytes={1} />);
    const bigFile = new File([Buffer.alloc(10)], "big.png", { type: "image/png" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(screen.getByText(/ファイルサイズ/)).toBeTruthy();
    expect(onSend).not.toHaveBeenCalled();
  });
});

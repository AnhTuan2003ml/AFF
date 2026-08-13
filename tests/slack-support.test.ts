import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  escapeSlackText,
  isSlackSupportEnabled,
  verifySlackSignature,
} from "../src/services/slack.js";
import type { AppConfig } from "../src/config.js";

function signSlack(secret: string, timestamp: string, rawBody: string): string {
  return `v0=${createHmac("sha256", secret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
}

describe("verifySlackSignature", () => {
  const secret = "d1a60ef03e9f386ed35dc0848fd2e869";
  const rawBody = '{"type":"event_callback"}';
  const nowSeconds = 1_700_000_000;
  const timestamp = String(nowSeconds);

  it("chấp nhận chữ ký đúng", () => {
    expect(
      verifySlackSignature({
        signingSecret: secret,
        rawBody,
        timestamp,
        signature: signSlack(secret, timestamp, rawBody),
        nowSeconds,
      }),
    ).toBe(true);
  });

  it("từ chối chữ ký sai hoặc body bị sửa", () => {
    expect(
      verifySlackSignature({
        signingSecret: secret,
        rawBody: rawBody + "x",
        timestamp,
        signature: signSlack(secret, timestamp, rawBody),
        nowSeconds,
      }),
    ).toBe(false);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        rawBody,
        timestamp,
        signature: "v0=deadbeef",
        nowSeconds,
      }),
    ).toBe(false);
  });

  it("từ chối sự kiện quá 5 phút (chống replay)", () => {
    const oldTimestamp = String(nowSeconds - 301);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        rawBody,
        timestamp: oldTimestamp,
        signature: signSlack(secret, oldTimestamp, rawBody),
        nowSeconds,
      }),
    ).toBe(false);
  });

  it("từ chối khi thiếu secret/timestamp/chữ ký", () => {
    expect(
      verifySlackSignature({
        signingSecret: "",
        rawBody,
        timestamp,
        signature: signSlack(secret, timestamp, rawBody),
        nowSeconds,
      }),
    ).toBe(false);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        rawBody,
        timestamp: "",
        signature: "x",
        nowSeconds,
      }),
    ).toBe(false);
  });
});

describe("escapeSlackText", () => {
  it("escape 3 ký tự điều khiển của mrkdwn", () => {
    expect(escapeSlackText("a <b> & c")).toBe("a &lt;b&gt; &amp; c");
  });
});

describe("isSlackSupportEnabled", () => {
  it("chỉ bật khi có đủ token và kênh", () => {
    const base = { SLACK_BOT_TOKEN: "", SLACK_SUPPORT_CHANNEL: "" };
    expect(isSlackSupportEnabled(base as AppConfig)).toBe(false);
    expect(
      isSlackSupportEnabled({
        ...base,
        SLACK_BOT_TOKEN: "xoxb-test",
      } as AppConfig),
    ).toBe(false);
    expect(
      isSlackSupportEnabled({
        SLACK_BOT_TOKEN: "xoxb-test",
        SLACK_SUPPORT_CHANNEL: "#cskh",
      } as AppConfig),
    ).toBe(true);
  });
});

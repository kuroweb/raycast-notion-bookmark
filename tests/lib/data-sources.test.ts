import { describe, expect, it } from "vitest";
import { preferredDataSourceId } from "../../src/lib/data-sources";

const dataSources = [
  { id: "ds-1", title: "Tech" },
  { id: "ds-2", title: "Work" },
];

describe("preferredDataSourceId", () => {
  it("選択中に残っている id ならそのまま使う", () => {
    expect(preferredDataSourceId(dataSources, "ds-2")).toBe("ds-2");
  });

  it("選択から外れた id は使わない（呼び出し側が先頭へフォールバックする）", () => {
    expect(preferredDataSourceId(dataSources, "ds-9")).toBeUndefined();
    expect(preferredDataSourceId([], "ds-1")).toBeUndefined();
  });

  it("前回の保存先がなければ undefined", () => {
    expect(preferredDataSourceId(dataSources, undefined)).toBeUndefined();
  });
});

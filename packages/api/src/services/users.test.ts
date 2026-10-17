import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./users";

describe("password hashing", () => {
  it("stores a salted hash that verifies only the matching password", async () => {
    const firstHash = await hashPassword("correct horse battery staple");
    const secondHash = await hashPassword("correct horse battery staple");

    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword("correct horse battery staple", firstHash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", firstHash)).resolves.toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyPassword("any password", "not-a-scrypt-hash")).rejects.toThrow("Invalid password hash format");
  });
});

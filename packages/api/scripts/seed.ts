/**
 * Demo data relative to "now": a volleyball crew with a weekly game, a dinner crew,
 * everyone's availability, and a few split bills. Sign in as alex@lowkey.dev.
 */
import { db, schema } from "@lowkey/db";
import { sql } from "drizzle-orm";
import { addZonedDays, startOfZonedDay, zonedParts, zonedToUtc } from "../src/lib/time";
import * as availability from "../src/services/availability";
import * as crews from "../src/services/crews";
import * as expenses from "../src/services/expenses";
import * as plans from "../src/services/plans";
import * as users from "../src/services/users";

const TZ = "America/New_York";
const DEMO_PASSWORD = "lowkey-demo";
type User = typeof schema.users.$inferSelect;

async function main() {
  await db.execute(sql`truncate ${schema.users}, ${schema.crews} restart identity cascade`);

  const seededPeople = await Promise.all(
    [
      ["Alex", "alex@lowkey.dev"],
      ["Priya", "priya@lowkey.dev"],
      ["Jordan", "jordan@lowkey.dev"],
      ["Sam", "sam@lowkey.dev"],
      ["Maya", "maya@lowkey.dev"],
      ["Theo", "theo@lowkey.dev"],
    ].map(async ([name, email]) => await users.createAccount(db, {
      name: name!,
      email: email!,
      password: DEMO_PASSWORD,
      timezone: TZ,
    })),
  );
  const people: User[] = seededPeople.map((user) => {
    if (!user) throw new Error("Could not create a demo account");
    return user;
  });
  const [alex, priya, jordan, sam, maya, theo] = people as [User, User, User, User, User, User];

  const volleyball = await crews.createCrew(db, alex.id, { name: "Tuesday Volleyball", emoji: "🏐" });
  const dinner = await crews.createCrew(db, priya.id, { name: "Dinner Club", emoji: "🍜" });
  for (const u of [priya, jordan, sam, theo]) await crews.joinCrew(db, u.id, volleyball.inviteCode);
  for (const u of [alex, maya, jordan]) await crews.joinCrew(db, u.id, dinner.inviteCode);

  // Dates relative to today, in New York time.
  const today = startOfZonedDay(new Date(), TZ);
  const at = (daysFromToday: number, hour: number, minute = 0) => {
    const d = zonedParts(addZonedDays(today, daysFromToday, TZ), TZ);
    return zonedToUtc(d.year, d.month, d.day, hour * 60 + minute, TZ);
  };
  const nextWeekday = (weekday: number) => {
    const w = zonedParts(today, TZ).weekday;
    return (weekday - w + 7) % 7 || 7;
  };

  // Weekly volleyball, started a couple of weeks ago.
  const tue = nextWeekday(2) - 14;
  const vb = await plans.createPlan(db, alex.id, {
    crewId: volleyball.id,
    title: "Volleyball at Pier 25",
    description: "Bring water. Net goes up at 7.",
    location: "Pier 25, Hudson River Park",
    kind: "sports",
    startsAt: at(tue, 19),
    endsAt: at(tue, 21),
    repeatsWeekly: true,
    capacity: 12,
  });
  const nextTue = at(nextWeekday(2), 19);
  await plans.rsvp(db, priya.id, { planId: vb.id, occurrenceStart: nextTue, status: "going", scope: "series" });
  await plans.rsvp(db, jordan.id, { planId: vb.id, occurrenceStart: nextTue, status: "going", scope: "occurrence" });
  await plans.rsvp(db, sam.id, { planId: vb.id, occurrenceStart: nextTue, status: "maybe", scope: "occurrence" });
  await plans.rsvp(db, theo.id, { planId: vb.id, occurrenceStart: nextTue, status: "declined", scope: "occurrence" });

  const fri = nextWeekday(5);
  const ramen = await plans.createPlan(db, priya.id, {
    crewId: dinner.id,
    title: "Ramen at Ippudo",
    location: "Ippudo, 4th Ave",
    kind: "food",
    startsAt: at(fri, 19, 30),
    endsAt: at(fri, 21, 30),
    repeatsWeekly: false,
  });
  await plans.rsvp(db, alex.id, { planId: ramen.id, occurrenceStart: at(fri, 19, 30), status: "going", scope: "occurrence" });
  await plans.rsvp(db, maya.id, { planId: ramen.id, occurrenceStart: at(fri, 19, 30), status: "going", scope: "occurrence" });

  const sat = nextWeekday(6);
  await plans.createPlan(db, sam.id, {
    crewId: volleyball.id,
    title: "Catan + takeout",
    location: "Sam's place",
    kind: "games",
    startsAt: at(sat, 18),
    endsAt: at(sat, 22),
    repeatsWeekly: false,
  });

  // Last week's dinner that already got split.
  const pastDinner = await plans.createPlan(db, priya.id, {
    crewId: dinner.id,
    title: "Thai at Wayla",
    kind: "food",
    startsAt: at(-5, 19),
    endsAt: at(-5, 21),
    repeatsWeekly: false,
  });

  // Availability: work hours for most people, some explicit free evenings.
  const workWeek = [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinute: 9 * 60, endMinute: 18 * 60 }));
  for (const u of people) await availability.setWeeklyPattern(db, u.id, { kind: "busy", blocks: workWeek });
  await availability.setWeeklyPattern(db, jordan.id, {
    kind: "busy",
    blocks: [...workWeek, { dayOfWeek: 3, startMinute: 18 * 60, endMinute: 21 * 60 }],
  });
  await availability.setWeeklyPattern(db, priya.id, {
    kind: "free",
    blocks: [3, 4].map((d) => ({ dayOfWeek: d, startMinute: 18 * 60 + 30, endMinute: 23 * 60 })),
  });
  await availability.setWeeklyPattern(db, alex.id, {
    kind: "free",
    blocks: [{ dayOfWeek: 4, startMinute: 18 * 60 + 30, endMinute: 23 * 60 }, { dayOfWeek: 0, startMinute: 11 * 60, endMinute: 17 * 60 }],
  });
  await availability.addOneOff(db, sam.id, { kind: "busy", label: "Cousin's wedding", startsAt: at(sat + 1, 10), endsAt: at(sat + 1, 23) });
  await availability.addOneOff(db, theo.id, { kind: "busy", label: "Out of town", startsAt: at(2, 0), endsAt: at(5, 0) });

  // Money
  await expenses.createExpense(db, priya.id, {
    crewId: dinner.id,
    planId: pastDinner.id,
    description: "Thai at Wayla",
    amountCents: 18640,
    paidById: priya.id,
    split: { method: "equal", userIds: [priya.id, alex.id, maya.id, jordan.id] },
  });
  await expenses.createExpense(db, alex.id, {
    crewId: dinner.id,
    description: "Wine for Priya's",
    amountCents: 4200,
    paidById: alex.id,
    split: { method: "equal", userIds: [priya.id, alex.id, maya.id] },
  });
  await expenses.createExpense(db, alex.id, {
    crewId: volleyball.id,
    planId: vb.id,
    description: "New volleyball + pump",
    amountCents: 5500,
    paidById: alex.id,
    split: { method: "equal", userIds: [alex.id, priya.id, jordan.id, sam.id, theo.id] },
  });
  await expenses.settleUp(db, jordan.id, { crewId: volleyball.id, toUserId: alex.id, amountCents: 1100 });

  console.log("✓ seeded. Sign in as alex@lowkey.dev (or priya@, jordan@, sam@, maya@, theo@)");
  console.log(`  Demo password: ${DEMO_PASSWORD}`);
  console.log(`  Volleyball invite code: ${volleyball.inviteCode}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

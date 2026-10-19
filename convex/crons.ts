import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons=cronJobs();
crons.interval("Expire temporary Expo relay state",{seconds:30},internal.expoRelay.sweep,{});
export default crons;

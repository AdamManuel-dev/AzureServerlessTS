import { Context } from "@azure/functions";
import { Dao, QueryBuilder } from "../services";

export async function index(context: Context, input: any): Promise<Context> {
  context.res = {};
  return context;
}

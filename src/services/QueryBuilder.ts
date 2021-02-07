import { flattenDeep, camelCase } from "lodash";

export class Or {
  private _left: Where;
  private _right: Where;
  private _list: Where[] = [];

  public left(clause: Where) {
    this._left = clause;
    return this;
  }

  public right(clause: Where) {
    this._right = clause;
    return this;
  }

  public chain(clauses: Where[]) {
    this._list = [...this._list, ...clauses];
    return this;
  }

  public build() {
    if (this._left && this._right && this._list.length !== 0) {
      throw new Error("Must have either a pair or a list, but not both.");
    }
    if (this._list.length > 1) {
      const first = this._list.shift();
      let clauses = `(${first ? first.build() : ""}`;
      clauses = this._list.reduce((query, clause) => {
        return query.concat(` OR ${clause.build()}`);
      }, clauses);
      return `${clauses})`;
    }
    if (this._list.length === 1) return this._list[0].build();
    return `(${this._left.build()} OR ${this._right.build()})`;
  }
}

export class Where {
  private leftPath: string;
  private rightVaue: string | number;
  private rightSymbol: {
    name: string;
    value: any;
  };
  private operation: "=" | "<" | "<=" | ">" | ">=" | "" | string;
  private qb: QueryBuilder;
  private _spaces = true;
  constructor(path: string, qb?: QueryBuilder) {
    if (!!path && typeof path === "string") {
      this.leftPath = "c." + path;
    } else {
      this.leftPath = "*";
    }
    this.qb = qb as any;
  }
  eq(value: any) {
    this.rightVaue =
      typeof value === "boolean" ||
      typeof value === "number" ||
      value.toString().includes("@")
        ? `${value}`
        : `"${value}"`;
    this.operation = "=";
    return (this.qb || this) as QueryBuilder;
  }
  lt(value: any) {
    this.rightVaue =
      typeof value === "boolean" ||
      typeof value === "number" ||
      value.toString().includes("@")
        ? `${value}`
        : `"${value}"`;
    this.operation = "<";
    return (this.qb || this) as QueryBuilder;
  }
  ltOrEq(value: any) {
    this.rightVaue =
      typeof value === "boolean" ||
      typeof value === "number" ||
      value.toString().includes("@")
        ? `${value}`
        : `"${value}"`;
    this.operation = "<=";
    return (this.qb || this) as QueryBuilder;
  }
  gt(value: any) {
    this.rightVaue =
      typeof value === "boolean" ||
      typeof value === "number" ||
      value.toString().includes("@")
        ? `${value}`
        : `"${value}"`;
    this.operation = ">";
    return (this.qb || this) as QueryBuilder;
  }
  gtOrEq(value: any) {
    this.rightVaue =
      typeof value === "boolean" ||
      typeof value === "number" ||
      value.toString().includes("@")
        ? `${value}`
        : `"${value}"`;
    this.operation = ">=";
    return (this.qb || this) as QueryBuilder;
  }
  isDefined() {
    const toCheck = this.leftPath;
    this.leftPath = "";
    this.operation = "IS_DEFINED";
    this.rightVaue = `(${toCheck})`;
    this._spaces = false;
    return (this.qb || this) as QueryBuilder;
  }
  contains(value: string, caseInsensitive = true) {
    this.leftPath = `CONTAINS(${this.leftPath},`;
    this.operation = `'${value}'`;
    this.rightVaue = `,${caseInsensitive})`;
    this._spaces = false;
    return (this.qb || this) as QueryBuilder;
  }
  build() {
    return this._spaces
      ? `${this.leftPath} ${this.operation} ${this.rightVaue}`
      : this.leftPath.concat(this.operation, this.rightVaue + "");
  }
  static combineWheres(list: Where[]) {
    return list.map((where) => where.build()).join(" AND ");
  }
  public toString() {
    return this.build();
  }
}

export class QueryBuilder {
  private _selector: string;
  private _selectAs: string;
  private _page: {
    offset: number;
    limit: number;
  };
  private _top: number;
  private _wheres: Where[] = [];
  private _order: {
    property: string;
    direction: "asc" | "desc";
  };
  private partitions: string[];
  constructor(...partitions: string[]) {
    this.partitions = partitions;
  }

  private getPartitionString() {
    // console.log(this.partitions);
    const newString = this.partitions.toString(); //.replace(/[\[|\]]/g, "");
    // console.log(newString);
    return newString;
  }

  public select(input: string, as?: string) {
    if (input === "count") {
      this._selector = "COUNT(1)";
      if (as) {
        this._selectAs = as;
      }
      return this;
    } else {
      this._selector = input;
      if (as) {
        this._selectAs = as;
      }
      return this;
    }
  }

  public where(path: string) {
    const _where = new Where(path, this);
    this._wheres.push(_where);
    return _where;
  }

  public paginate(index: number, numberOfRecords: number) {
    if (!!this._top)
      throw {
        error: "Pagination Error",
        details: "Cannot add paginate if top already set",
      };
    this._page = {
      offset: index,
      limit: index + numberOfRecords,
    };
    return this;
  }

  public top(total: number) {
    if (!!this._page && !!this._page.offset && !!this._page.limit)
      throw {
        error: "Pagination Error",
        details: "Cannot add top if paginate already set",
      };
    this._top = total;
    return this;
  }

  public orderBy(property: string, direction: "asc" | "desc") {
    this._order = {
      ...(property ? { property } : { property: "" }),
      direction,
    };
    return this;
  }

  /**
   * Proper order
   * ```SELECT * FROM c as discount WHERE discount.code = "CBDDAY" AND discount.active = true```
   */
  private buildQuery() {
    const getSelector = () => {
      if (this._selector) {
        if (this._selector === "*") return "* ";
        if (this._selector === "count" || this._selector === "COUNT(1)")
          return "COUNT(1) ";
        if (this._selector === "")
          throw Error("Selector cannot be an empty string");
        else return `c.${this._selector} `;
      } else {
        return "* ";
      }
    };

    let q = "SELECT ";
    if (this._top) q += `TOP ${this._top} `;
    q += getSelector();
    if (this._selector !== "*" && this._selectAs) q += `AS ${this._selectAs} `;
    q += "FROM c ";
    if (this._wheres && Array.isArray(this._wheres) && this._wheres.length > 0)
      q += `WHERE ${Where.combineWheres(this._wheres)} `;
    if (
      !q.includes("COUNT(1)") &&
      this._order &&
      this._order.property &&
      this._order.direction
    )
      q += `ORDER BY c.${this._order.property} ${this._order.direction} `;
    if (!this._top && q.includes("*")) {
      if (!this._page)
        this._page = {
          limit: 10,
          offset: 0,
        };
      q += `OFFSET ${this._page.offset} LIMIT ${this._page.limit} `;
    }
    return q.trim();
  }

  public build(
    parameters?: {
      name: string;
      value: any;
    }[]
  ) {
    const query = this.buildQuery();
    const parameterNames = (parameters || []).map((param) => param.name);
    const startsWithAt = query
      .split(" ")
      .filter((token) => token.charAt(0) === "@");
    if (parameterNames.length !== startsWithAt.length) {
      const missing = startsWithAt
        .filter((withAt) => !parameterNames.includes(withAt))
        .toString();
      if (missing)
        throw new Error(
          `Missing parameters: key:value map associated with "${missing}".`
        );
      const extra = parameterNames.filter((ref) => !startsWithAt.includes(ref));
      if (extra)
        throw new Error(`Extra key:values: "${extra}" not found in query.`);
    }
    return {
      query,
      parameters,
      partition: this.getPartitionString(),
    } as {
      query: string;
      parameters: { name: string; value: any }[];
      partition: string;
    };
  }
}

/**
 *
 * @param obj
 */
function _flatten(obj: any, prefix = "") {
  if (typeof obj === "object") {
    const flattened = Object.entries(obj).reduce(
      (list: any[], [key, value]: [string, any]) => {
        return [
          ...list,
          {
            path: prefix + key,
            value,
          },
        ];
      },
      []
    );
    const nested = flattened.filter(
      ({ path, value }: any) => typeof value === "object"
    );
    const flat = flattened.filter(
      ({ path, value }: any) => typeof value !== "object"
    );
    const denested = nested.map(({ path, value }: any) =>
      _flatten(value, path + ".")
    ) as any;
    return [...flat, ...denested];
  } else {
    return {
      path: prefix,
      value: obj,
    };
  }
}

function replaceArrayReferences(key: string) {
  const found = key.match(/\.[0-9]/g);
  if (found) {
    const newKey = found.reduce((_key, foundArrayRef) => {
      const correctNotation = foundArrayRef.replace(".", "[") + "]";
      return _key.replace(foundArrayRef, correctNotation);
    }, key);
    return newKey;
  }
  return key;
}

export function flattenObject(obj: {} | any) {
  const result = _flatten(obj);
  const flatResult = flattenDeep<{ path: string; value: any }>(result as any);
  const cleanedResult = flatResult.map(({ path, value }) => {
    return {
      name: "@" + camelCase(path),
      path: replaceArrayReferences(path),
      value,
    };
  });
  return cleanedResult;
}

import { CosmosClient, Database, Container } from "@azure/cosmos";

function assertNever(never: never): never {
  throw new Error(`Did not expect ${never}`);
}

export interface CosmosSecret {
  endpoint: string;
  masterKey: string;
}

export interface QueryLiteral {
  query: string;
  parameters: {
    name: string;
    value: any;
  }[];
  partition?: string | string[];
}

export interface BaseItem {
  _partitionKey?: string;
  id?: string;
  [property: string]: any;
}

export class Dao {
  aggregateCost: number = 0;

  logResourceCharge = (charge: number, partition?: string) => {
    this.aggregateCost += charge;
    console.log(
      `COST(${partition || "?"}): ${
        Number.parseInt(charge * 100 + "") / 100
      } (${Number.parseInt(this.aggregateCost * 100 + "") / 100})`
    );
  };

  private _secrets: CosmosSecret;
  public databaseId: any;
  public collectionId: any;
  private client: CosmosClient;
  private database: Database;
  private container: Container;

  /**
   * Creates a Data Access Object
   * @param secrets Secrets to access DB
   * @param client Reusing an initialized client
   * @param databaseId Database Name
   * @param containerId Container Name
   */
  constructor({
    secrets,
    client,
    databaseId,
    containerId,
  }: {
    secrets: CosmosSecret;
    client?: CosmosClient;
    databaseId?: string;
    containerId?: string;
  }) {
    this.aggregateCost = 0;
    this._secrets = secrets;
    if (!!client) this.client = client;
    if (!this.client) {
      this.client = new CosmosClient(
        `AccountEndpoint=${this._secrets.endpoint};AccountKey=${this._secrets.masterKey}`
      );
    }
    this.databaseId = databaseId;
    this.collectionId = containerId;
    this.client.databases
      .createIfNotExists({
        id: this.databaseId,
      })
      .then(({ database }: any) => {
        this.database = database;

        this.database.containers
          .createIfNotExists({
            id: this.collectionId,
          })
          .then(({ container }: any) => {
            this.container = container;
          });
      });
  }

  async init() {
    this.aggregateCost = 0;
    if (!this.client) {
      this.client = new CosmosClient(
        `AccountEndpoint=${this._secrets.endpoint};AccountKey=${this._secrets.masterKey}`
      );
    }
    if (!this.database) {
      const { database } = await this.client.databases.createIfNotExists({
        id: this.databaseId,
      });
      this.database = database;
    }
    if (!this.container) {
      const { container } = await this.database.containers.createIfNotExists({
        id: this.collectionId,
      });
      this.container = container;
    }
  }

  async query<T extends BaseItem>({
    query,
    parameters,
    partition,
  }: QueryLiteral) {
    await this.init();
    if (!this.container) {
      throw new Error("Collection is not initialized.");
    }
    const response = await this.container.items.query<T>(
      {
        query,
        parameters,
      },
      {
        initialHeaders: {
          "x-ms-documentdb-partitionkey": Array.isArray(partition)
            ? `["${partition.join(",")}"]`
            : `["${partition}"]`,
        },
      }
    );
    // .toArrayImplementation()
    const items = await response.fetchAll();
    console.log("QUERY", `[${query}]`);
    this.logResourceCharge(items.requestCharge, partition?.toString());

    return items.resources as T[];
  }

  /**
   * TODO - ADAM
   * Have this create multiple parameters that are filled out when they create an item
   *  * Create On
   *  * Create By
   *  * Location Data
   *  * Time Logs
   *  * Etc.
   *
   * @param {*} item
   */
  async create<T extends BaseItem>(
    item: T,
    defaults: any = {
      createdOn: Number.parseInt(String(Date.now() / 1000)),
      // updatedOn: Number.parseInt(String(Date.now() / 1000))
    }
  ) {
    await this.init();
    // Sort Attributes Here
    const response = await this.container.items.create<T>({
      ...item,
      ...defaults,
    });

    console.log("CREATE");
    this.logResourceCharge(
      response.requestCharge,
      item?._partitionKey?.toString()
    );
    return response;
  }

  async update<T extends BaseItem>(
    record: Partial<T>,
    partitionKey: string,
    defaults: any = {
      updatedOn: Number.parseInt(String(Date.now() / 1000)),
    }
  ) {
    if (!!record.id && typeof record.id === "string") {
      await this.init();
      const item = await this.get(record.id, partitionKey);
      const oldRecord = await item.read();
      let response = await item.replace({
        ...oldRecord.resource,
        ...record,
        ...defaults,
      });

      console.log("UPDATE");
      this.logResourceCharge(response.requestCharge, partitionKey?.toString());
      return response.resource as T;
    } else {
      throw new Error("Record must contain an ID");
    }
  }

  /**
   *
   * @param item
   */
  async delete<T extends BaseItem>(
    item: T | { id: string; _partitionKey: string }
  ) {
    if (
      !!item.id &&
      typeof item.id === "string" &&
      !!item._partitionKey &&
      typeof item._partitionKey === "string"
    ) {
      await this.init();
      const record = await this.get(item.id, item._partitionKey);
      const response = await record.replace({
        ...(await record.read()).resource,
        ttl: 1,
      });
      console.log("DELETE");
      this.logResourceCharge(
        response.requestCharge,
        item?._partitionKey?.toString()
      );
      return response;
    } else {
      throw new Error("Record must contain an ID");
    }
  }

  /**
   * Returns the full Cosmos Item
   * @param itemId Items UUID
   * @param type PartitionKey
   */
  async get(itemId: string, partitionKey: string) {
    await this.init();
    const item = this.container.item(itemId, partitionKey);

    return item;
  }

  /**
   * Returns the JSON Cosmos Item
   * @param itemId Items UUID
   * @param type PartitionKey
   */
  async getRecord<T extends BaseItem>(itemId: string, partitionKey: string) {
    await this.init();
    const item = this.container.item(itemId, partitionKey);
    const response = await item.read<T>();

    console.log("GET");
    this.logResourceCharge(response.requestCharge, partitionKey?.toString());
    return response;
  }
}

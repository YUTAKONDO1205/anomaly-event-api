import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, ScanCommandInput, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { EventItem, EventStatus } from "../models/event";
import { ListEventsQuery } from "../types/event";
import { env } from "../utils/env";
import { readLocalEvents, updateLocalEvents } from "../utils/localStore";

const client = new DynamoDBClient({ region: env.region });
const docClient = DynamoDBDocumentClient.from(client);

export class EventRepository {
  async save(item: EventItem): Promise<void> {
    if (env.storageMode === "local") {
      await updateLocalEvents((items) => [...items, item]);
      return;
    }

    await docClient.send(
      new PutCommand({
        TableName: env.eventsTable,
        Item: item
      })
    );
  }

  async findAll(filters: ListEventsQuery = {}): Promise<EventItem[]> {
    if (env.storageMode === "local") {
      const items = await readLocalEvents();
      return items.filter((item) => {
        if (filters.status && item.status !== filters.status) {
          return false;
        }

        if (filters.deviceId && item.deviceId !== filters.deviceId) {
          return false;
        }

        return true;
      });
    }

    const scanInput: ScanCommandInput = {
      TableName: env.eventsTable
    };

    const filterExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, string> = {};

    if (filters.status) {
      filterExpressions.push("#status = :status");
      expressionAttributeNames["#status"] = "status";
      expressionAttributeValues[":status"] = filters.status;
    }

    if (filters.deviceId) {
      filterExpressions.push("deviceId = :deviceId");
      expressionAttributeValues[":deviceId"] = filters.deviceId;
    }

    if (filterExpressions.length > 0) {
      scanInput.FilterExpression = filterExpressions.join(" AND ");
      scanInput.ExpressionAttributeNames = expressionAttributeNames;
      scanInput.ExpressionAttributeValues = expressionAttributeValues;
    }

    // A single Scan caps each response at 1MB of scanned data and signals more
    // via LastEvaluatedKey. Loop until exhausted so dashboard totals and the
    // event list are never silently truncated once the table grows past ~1MB.
    const items: EventItem[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new ScanCommand({ ...scanInput, ExclusiveStartKey: lastEvaluatedKey })
      );

      if (result.Items) {
        items.push(...(result.Items as EventItem[]));
      }

      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    return items;
  }

  async findById(eventId: string): Promise<EventItem | null> {
    if (env.storageMode === "local") {
      const items = await readLocalEvents();
      return items.find((item) => item.eventId === eventId) ?? null;
    }

    const result = await docClient.send(
      new GetCommand({
        TableName: env.eventsTable,
        Key: { eventId }
      })
    );

    return (result.Item as EventItem | undefined) ?? null;
  }

  async updateStatus(
    eventId: string,
    status: EventStatus,
    expectedStatus?: EventStatus
  ): Promise<EventItem | null> {
    if (env.storageMode === "local") {
      let updatedItem: EventItem | null = null;
      await updateLocalEvents((items) =>
        items.map((item) => {
          if (item.eventId !== eventId) {
            return item;
          }

          updatedItem = {
            ...item,
            status,
            updatedAt: new Date().toISOString()
          };

          return updatedItem;
        })
      );
      return updatedItem;
    }

    const conditionExpressions = ["attribute_exists(eventId)"];
    const expressionAttributeValues: Record<string, string> = {
      ":status": status,
      ":updatedAt": new Date().toISOString()
    };

    // Guard the write against a concurrent status change so the transition the
    // service validated is the one that actually applies (optimistic locking).
    if (expectedStatus) {
      conditionExpressions.push("#status = :expectedStatus");
      expressionAttributeValues[":expectedStatus"] = expectedStatus;
    }

    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: env.eventsTable,
          Key: { eventId },
          UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
          ConditionExpression: conditionExpressions.join(" AND "),
          ExpressionAttributeNames: {
            "#status": "status"
          },
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: "ALL_NEW"
        })
      );

      return (result.Attributes as EventItem | undefined) ?? null;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException || (error as { name?: string }).name === "ConditionalCheckFailedException") {
        return null;
      }

      throw error;
    }
  }
}

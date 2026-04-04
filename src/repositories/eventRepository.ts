import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, ScanCommandInput, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { EventItem, EventStatus } from "../models/event";
import { ListEventsQuery } from "../types/event";
import { env } from "../utils/env";

const client = new DynamoDBClient({ region: env.region });
const docClient = DynamoDBDocumentClient.from(client);

export class EventRepository {
  async save(item: EventItem): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: env.eventsTable,
        Item: item
      })
    );
  }

  async findAll(filters: ListEventsQuery = {}): Promise<EventItem[]> {
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

    const result = await docClient.send(new ScanCommand(scanInput));

    return (result.Items as EventItem[] | undefined) ?? [];
  }

  async findById(eventId: string): Promise<EventItem | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: env.eventsTable,
        Key: { eventId }
      })
    );

    return (result.Item as EventItem | undefined) ?? null;
  }

  async updateStatus(eventId: string, status: EventStatus): Promise<EventItem | null> {
    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: env.eventsTable,
          Key: { eventId },
          UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
          ConditionExpression: "attribute_exists(eventId)",
          ExpressionAttributeNames: {
            "#status": "status"
          },
          ExpressionAttributeValues: {
            ":status": status,
            ":updatedAt": new Date().toISOString()
          },
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

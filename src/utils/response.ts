const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
};

export function ok<T>(data: T, message = "OK") {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ message, data })
  };
}

export function created<T>(data: T, message = "Created") {
  return {
    statusCode: 201,
    headers,
    body: JSON.stringify({ message, data })
  };
}

export function badRequest(message = "Bad Request") {
  return {
    statusCode: 400,
    headers,
    body: JSON.stringify({ message })
  };
}

export function notFound(message = "Not Found") {
  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ message })
  };
}

export function conflict(message = "Conflict") {
  return {
    statusCode: 409,
    headers,
    body: JSON.stringify({ message })
  };
}

export function serverError(message = "Internal Server Error") {
  return {
    statusCode: 500,
    headers,
    body: JSON.stringify({ message })
  };
}

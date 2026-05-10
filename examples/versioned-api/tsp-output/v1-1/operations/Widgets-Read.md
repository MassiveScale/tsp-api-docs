# Read

Read widgets

Version: `v1.1`

Path: API > Widgets > read

## HTTP request

```http
GET /widgets/{id}
```

## Optional query parameters

This method does not support query parameters.


## Request headers

No custom request headers are required for this method.


## Request body

Don't supply a request body for this method.


## Response

`Widget | Error`

| Status code | Type | Description |
| --- | --- | --- |
| 200 OK | Widget | The request has succeeded. |
| default | Error | An error response |


## Signature

`read(id: string) => Widget | Error`

## Parameters

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| id | string | Yes | No summary provided. |
## Examples

### Example 1

Read widgets

#### Request

```http
GET /widgets/string
```

#### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "string",
  "name": "string",
  "weight": 0,
  "color": "red",
  "size": "Small"
}
```


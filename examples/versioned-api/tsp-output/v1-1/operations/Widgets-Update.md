# Update

Update a widget

Version: `v1.1`

Path: API > Widgets > update

## HTTP request

```http
PATCH /widgets/{id}
```

## Optional query parameters

This method does not support query parameters.


## Request headers

No custom request headers are required for this method.


## Request body

Supply a request body of type `WidgetMergePatchUpdate`.

Supported content types: `application/merge-patch+json`

```json
{
  "id": "string",
  "name": "string",
  "weight": 0,
  "color": "red",
  "size": "Small"
}
```


## Response

`Widget | Error`

| Status code | Type | Description |
| --- | --- | --- |
| 200 OK | Widget | The request has succeeded. |
| default | Error | An error response |


## Signature

`update(id: string, body: WidgetMergePatchUpdate) => Widget | Error`

## Parameters

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| id | string | Yes | No summary provided. |
| body | WidgetMergePatchUpdate | Yes | No summary provided. |
## Examples

### Example 1

Update a widget

#### Request

```http
PATCH /widgets/string
Content-Type: application/merge-patch+json

{
  "id": "string",
  "name": "string",
  "weight": 0,
  "color": "red",
  "size": "Small"
}
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


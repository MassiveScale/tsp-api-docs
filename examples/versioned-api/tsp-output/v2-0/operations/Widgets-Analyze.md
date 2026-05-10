# Analyze

Analyze a widget

Version: `v2.0`

Path: API > Widgets > analyze

## HTTP request

```http
POST /widgets/{id}/analyze
```

## Optional query parameters

This method does not support query parameters.


## Request headers

No custom request headers are required for this method.


## Request body

Don't supply a request body for this method.


## Response

`AnalyzeResult | Error`

| Status code | Type | Description |
| --- | --- | --- |
| 200 OK | AnalyzeResult | The request has succeeded. |
| default | Error | An error response |


## Signature

`analyze(id: string) => AnalyzeResult | Error`

## Parameters

| Name | Type | Required | Summary |
| --- | --- | --- | --- |
| id | string | Yes | No summary provided. |
## Examples

### Example 1

Analyze a widget

#### Request

```http
POST /widgets/string/analyze
```

#### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "string",
  "analysis": "string"
}
```


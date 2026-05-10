# analyze

Analyze a widget

Path: API > DemoService > Widgets > analyze

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

`DemoService.AnalyzeResult | DemoService.Error`

| Status code | Type | Description |
| --- | --- | --- |
| 200 OK | DemoService.AnalyzeResult | The request has succeeded. |
| default | DemoService.Error | An error response |


## Signature

`analyze(id: string) => DemoService.AnalyzeResult | DemoService.Error`

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


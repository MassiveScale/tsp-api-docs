import "@typespec/http";
import "@typespec/versioning";

using Http;
using Versioning;

@versioned(Versions)
@service(#{ title: "Widget Service" })
namespace MassiveScale.Versioned.Api.Example;

enum Versions {
  v1_0: "v1.0",
  v1_1: "v1.1",
  v2_0: "v2.0",
}


/** A widget is a small gadget that does something useful. */
model Widget {
  @doc("Unique identifier for the widget")
  id: string;
  @doc("Name of the widget")
  @added(Versions.v1_1)
  name: string;
  @doc("Weight of the widget in grams")
  weight: int32;
  @doc("Color of the widget")
  color: "red" | "blue";  
  @doc("Size of the widget")  
  size: Size;
}

@doc("Size of a widget")
enum Size {
  @doc("Small size, suitable for travel")
  Small;
  @doc("Medium size, suitable for home use")
  Medium;
  @doc("Large size, suitable for industrial use")
  Large;
}

@doc("List of widgets")
model WidgetList {
  @doc("Array of widgets")
  items: Widget[];
}

@error
@doc("An error response")
model Error {
  @doc("HTTP status code of the error")
  code: int32;
  @doc("Error message describing the problem")
  message: string;
}

@doc("Result of analyzing a widget")
@added(Versions.v2_0)
model AnalyzeResult {
  @doc("Unique identifier of the analyzed widget")
  id: string;
  @doc("Analysis result as a string")
  analysis: string;
}

@route("/widgets")
@tag("Widgets")
interface Widgets {
  /** List widgets */
  @get list(): WidgetList;

  /** Read widgets */
  @get read(@path id: string): Widget;

  /** Create a widget */
  @added(Versions.v1_1)
  @post
  create(@body body: Widget): Widget;

  /** Update a widget */
  @added(Versions.v1_1)
  @patch
  update(
    @path id: string,
    @body body: MergePatchUpdate<Widget>,
  ): NoContentResponse;

  /** Delete a widget */
  @added(Versions.v2_0)
  @delete
  delete(@path id: string): NoContentResponse;

  /** Analyze a widget */
  @added(Versions.v2_0)
  @route("{id}/analyze")
  @post
  analyze(@path id: string): AnalyzeResult;
}

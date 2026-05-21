using System.Text.Json;
using PRS.Api.Domain;
using PRS.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// ---- DI ------------------------------------------------------------------

builder.Services.AddMemoryCache();

builder.Services.AddHttpClient<SteamApiClient>(c =>
{
    c.Timeout = TimeSpan.FromSeconds(20);
    c.DefaultRequestHeaders.Add("User-Agent", "PRS.Api/1.0 (+price-recommendations)");
});

builder.Services.AddHttpClient<FxRateClient>(c =>
{
    c.Timeout = TimeSpan.FromSeconds(15);
});

builder.Services.AddSingleton<PricingService>();
builder.Services.AddSingleton<RecommendationsService>();

// ---- JSON config — snake_case keys, ignore nulls -------------------------

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    o.SerializerOptions.DefaultIgnoreCondition =
        System.Text.Json.Serialization.JsonIgnoreCondition.Never;
    o.SerializerOptions.NumberHandling =
        System.Text.Json.Serialization.JsonNumberHandling.AllowNamedFloatingPointLiterals;
});

// Permissive CORS for the publisher platform to call us cross-origin.
// Restrict in production by listing exact origins.
builder.Services.AddCors(o =>
{
    o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();
app.UseCors();

// ---- Endpoints -----------------------------------------------------------

app.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));

app.MapPost("/api/price-recommendations/calculate",
    async (CalculateRequest req, RecommendationsService svc, CancellationToken ct) =>
    {
        try
        {
            var response = await svc.CalculateAsync(req, ct);
            return Results.Ok(response);
        }
        catch (ValidationException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
        catch (HttpRequestException ex)
        {
            return Results.Problem(
                title: "Upstream service unavailable",
                detail: ex.Message,
                statusCode: 502);
        }
    });

app.Run();

// Make Program visible to integration tests in PRS.Api.Tests if needed.
public partial class Program { }

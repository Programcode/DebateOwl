# Recibe los eventos de Stripe en el punto de conexión de tu webhook

Examina los eventos de Stripe en tu punto de conexión webhook para que tu integración pueda activar reacciones automáticamente.

> #### Envía eventos a tu cuenta de AWS
> 
> Ahora puedes enviar eventos directamente a [Amazon EventBridge como destino de eventos](https://docs.stripe.com/event-destinations/eventbridge.md).

Crea un destino de evento para recibir eventos en un punto de conexión de webhook HTTPS. Después de que registres un punto de conexión de webhook, Stripe puede enviar datos de eventos en tiempo real al punto de conexión de webhook de tu aplicación cuando se produzcan [eventos](https://docs.stripe.com/event-destinations.md#events-overview) en tu cuenta de Stripe. Stripe usa HTTPS para enviar eventos de webhook a tu aplicación como una carga JSON que incluye un [objeto de evento](https://docs.stripe.com/api/events.md).

La recepción de eventos de webhook te ayuda a responder a eventos asincrónicos, como cuando el banco de un cliente confirma un pago, un cliente disputa un cargo o un pago recurrente se realiza correctamente.

## Empezar

Para comenzar a recibir eventos de webhook en tu aplicación, haz lo siguiente:

1. Crea un controlador de punto de conexión de webhook para recibir solicitudes de POST de datos de eventos.
1. Prueba en forma local tu controlador de puntos de conexión de webhook con la CLI de Stripe.
1. Crea un nuevo [destino de evento](https://docs.stripe.com/event-destinations.md) para el punto de conexión de webhook.
1. Protege el punto de conexión de webhook.

Puedes registrar y crear un punto de conexión para manejar varios tipos de eventos diferentes al mismo tiempo, o configurar puntos de conexión particulares para eventos específicos.

## Comportamientos de tipo de evento no admitidos para destinos de eventos de organización

Stripe envía la mayoría de los tipos de eventos de forma asíncrona, pero espera una respuesta para algunos tipos de eventos. En estos casos, Stripe se comporta de manera diferente en función de si el destino del evento responde o no.

Si el destino de tu evento recibe eventos de [Organización](https://docs.stripe.com/get-started/account/orgs.md), los que requieren una respuesta tienen las siguientes limitaciones:

- No puedes suscribirte a `issuing_authorization.request` para destinos de organización. En su lugar, configura un [punto de conexión de webhooks](https://docs.stripe.com/webhooks.md#example-endpoint) en una cuenta de Stripe dentro de la organización para suscribirte a este tipo de evento. Utiliza `issuing_authorization.request` para autorizar las solicitudes de compra en tiempo real.
- Los destinos de la organización que reciben `checkout_sessions.completed` no pueden[manejar el comportamiento de redirección](https://docs.stripe.com/checkout/fulfillment.md#redirect-hosted-checkout) cuando integras el [Proceso de compra](https://docs.stripe.com/payments/checkout.md) directamente en tu sitio web o redirigir a los clientes a una página de pago alojada en Stripe. Para influir en el comportamiento de redireccionamiento del proceso de compra, procesa este tipo de evento con un[punto de conexión webhook](https://docs.stripe.com/webhooks.md#example-endpoint) configurado en una cuenta de Stripe dentro de la organización.
- Los destinos de la organización que responden sin éxito a un evento de `invoice.created` no pueden influir en la [finalización automática de la factura cuando se utiliza el cobro automático](https://docs.stripe.com/billing/subscriptions/webhooks.md#understand). Debes procesar este tipo de evento con un[punto de conexión webhook](https://docs.stripe.com/webhooks.md#example-endpoint) configurado en una cuenta de Stripe dentro de la organización para activar la finalización automática de la factura.

## Crear un controlador

Configura una función de punto de conexión HTTP o HTTPS que pueda aceptar peticiones de webhooks con un método POST. Si todavía estás desarrollando su función de punto de conexión en tu máquina local, puedes usar HTTP. Después de que sea de acceso público, la función de punto de conexión de tu webhook debe usar HTTPS.

Configura la función del punto de conexión para que haga lo siguiente:

- Maneja las solicitudes POST con una carga JSON que consiste en un [objeto de evento](https://docs.stripe.com/api/events/object.md).
- Para controladores de [organización](https://docs.stripe.com/get-started/account/orgs.md) de eventos, inspecciona el valor del `context` para determinar qué cuenta de una organización generó el evento y, a continuación, establece el encabezado`Stripe-Context` correspondiente al valor `context`.
- Devuelve rápidamente un código de estado correcto (`2xx`) antes de cualquier lógica compleja que pueda causar un tiempo de espera. Por ejemplo, debes devolver una respuesta `200` antes de actualizar la factura del cliente como pagada en tu sistema contable.

> - Utiliza nuestro [generador interactivo de puntos de conexión de webhook](https://docs.stripe.com/webhooks/quickstart.md) para construir un punto de conexión webhook en tu lenguaje de programación.
- Usa la referencia de la API de Stripe para identificar los [objetos de eventos breves](https://docs.stripe.com/api/v2/events/event-types.md) u [objetos de eventos de instantánea](https://docs.stripe.com/api/events/object.md) que tu controlador de webhook necesita procesar.

#### Ejemplo de punto de conexión

Este fragmento de código es una función de webhook configurada para buscar eventos recibidos desde una cuenta de Stripe, gestionar los eventos y devolver respuestas `200`. Consulta el controlador de eventos de [instantáneas](https://docs.stripe.com/event-destinations.md#events-overview) cuando uses recursos de la API v1 y haz referencia al controlador de eventos [ligeros](https://docs.stripe.com/event-destinations.md#events-overview) cuando uses recursos de la API v2.

#### Controlador de eventos de instantáneas

Al crear un controlador de eventos de instantáneas, utiliza la definición de objeto de la API en el momento del evento para tu lógica accediendo a los campos `data.object` del evento. También puedes recuperar el recurso de la API de Stripe para acceder a la definición de objeto más reciente y actualizada.

#### Ruby

```ruby
require 'json'

# Replace this endpoint secret with your unique endpoint secret key
# If you're testing with the CLI, run 'stripe listen' to find the secret key
# If you defined your endpoint using the API or the Dashboard, check your webhook settings for your endpoint secret: https://dashboard.stripe.com/webhooks
endpoint_secret = 'whsec_...';

# Using Sinatra
post '/webhook' do
  payload = request.body.read
  event = nil

  begin
    event = Stripe::Event.construct_from(
      JSON.parse(payload, symbolize_names: true)
    )
  rescue JSON::ParserError => e
    # Invalid payload
    status 400
    return
  end

  # Check that you have configured webhook signing
  if endpoint_secret
    # Retrieve the event by verifying the signature using the raw body and the endpoint secret
    signature = request.env['HTTP_STRIPE_SIGNATURE'];
    begin
      event = Stripe::Webhook.construct_event(
        payload, signature, endpoint_secret
      )
    rescue Stripe::SignatureVerificationError => e
      puts "⚠️  Webhook signature verification failed. #{e.message}"
      status 400
    end
  end

  # Handle the event
  case event.type
  when 'payment_intent.succeeded'
    payment_intent = event.data.object # contains a Stripe::PaymentIntent
    # Then define and call a method to handle the successful payment intent.
    # handle_payment_intent_succeeded(payment_intent)
  when 'payment_method.attached'
    payment_method = event.data.object # contains a Stripe::PaymentMethod
    # Then define and call a method to handle the successful attachment of a PaymentMethod.
    # handle_payment_method_attached(payment_method)
  # ... handle other event types
  else
    puts "Unhandled event type: #{event.type}"
  end

  status 200
end
```

#### Gestor de eventos ligeros (Clover+)

Cuando crees un controlador de eventos ligeros, utiliza el método `fetchRelatedObject()` para recuperar la última versión del objeto asociado con el evento. Los eventos pueden contener [datos adicionales](https://docs.stripe.com/event-destinations.md#fetch-data) que solo puedes recuperar a través del método de instancia `.fetchEvent()` en `EventNotification`. La forma exacta de esos datos depende del `type` de evento.

Los tipos de eventos deben estar disponibles en el momento del lanzamiento para generar clases en esa versión del SDK. Para gestionar eventos para los que el SDK no tiene clases, usa la clase `UnknownEventNotification`.

#### Python

```python
import os
from stripe import StripeClient
from stripe.events import UnknownEventNotification

from flask import Flask, request, jsonify

app = Flask(__name__)
api_key = os.environ.get("STRIPE_API_KEY", "")
webhook_secret = os.environ.get("WEBHOOK_SECRET", "")

client = StripeClient(api_key)

@app.route("/webhook", methods=["POST"])
def webhook():
    webhook_body = request.data
    sig_header = request.headers.get("Stripe-Signature")

    try:
        event_notif = client.parse_event_notification(
            webhook_body, sig_header, webhook_secret
        )

        # type checkers will narrow the type based on the `type` property
        if event_notif.type == "v1.billing.meter.error_report_triggered":
            # in this block, event_notification is typed as
            # a V1BillingMeterErrorReportTriggeredEventNotification

            # there's basic info about the related object in the notification
            print(f"Meter w/ id {event_notif.related_object.id} had a problem")

            # or you can fetch the full object form the API for more details
            meter = event_notif.fetch_related_object()
            print(
                f"Meter {meter.display_name} ({meter.id}) had a problem"
            )

            # And you can always fetch the full event:
            event = event_notif.fetch_event()
            print(f"More info: {event.data.developer_message_summary}")

        elif event_notif.type == "v1.billing.meter.no_meter_found":
            # in this block, event_notification is typed as
            # a V1BillingMeterNoMeterFoundEventNotification

            # that class doesn't define `fetch_related_object` because the event
            # has no related object.
            # so this line would correctly give a type error:
            # meter = event_notif.fetch_related_object()

            # but fetching the event always works:
            event = event_notif.fetch_event()
            print(
                f"Err! No meter found: {event.data.developer_message_summary}"
            )

        # Events that were introduced after this SDK version release are
        # represented as `UnknownEventNotification`s.
        # They're valid, the SDK just doesn't have corresponding classes for them.
        # You must match on the "type" property instead.
        elif isinstance(event_notif, UnknownEventNotification):
            # these lines are optional, but will give you more accurate typing in this block
            from typing import cast

            event_notif = cast(UnknownEventNotification, event_notif)

            # continue matching on the type property
            # from this point on, the `related_object` property _may_ be None
            # (depending on the event type)
            if event_notif.type == "some.new.event":
                # if this event type has a related object, you can fetch it
                obj = event_notif.fetch_related_object()
                # otherwise, `obj` will just be `None`
                print(f"Related object: {obj}")

                # you can still fetch the full event, but it will be untyped
                event = event_notif.fetch_event()
                print(f"New event: {event.data}")  # type: ignore

        return jsonify(success=True), 200
    except Exception as e:
        return jsonify(error=str(e)), 400
```

#### Gestor de eventos ligeros (Acacia o Basil)

Cuando crees un controlador de eventos ligeros, utiliza el método `fetchRelatedObject()` para recuperar la última versión del objeto asociado con el evento. Los eventos ligeros pueden contener [datos contextuales adicionales](https://docs.stripe.com/event-destinations.md#fetch-data) que solo puedes recuperar con la API. Usa la llamada `retrieve()` con el ID de evento ligero para acceder a estos campos de carga adicionales.

#### Python

```python
import os
from stripe import StripeClient
from stripe.events import V1BillingMeterErrorReportTriggeredEvent

from flask import Flask, request, jsonify

app = Flask(__name__)
api_key = os.environ.get('STRIPE_API_KEY')
webhook_secret = os.environ.get('WEBHOOK_SECRET')

client = StripeClient(api_key)

@app.route('/webhook', methods=['POST'])
def webhook():
    webhook_body = request.data
    sig_header = request.headers.get('Stripe-Signature')

try:
    thin_event = client.parse_thin_event(webhook_body, sig_header, webhook_secret)

    # Fetch the event data to understand the failure
    event = client.v2.core.events.retrieve(thin_event.id)
    if isinstance(event, V1BillingMeterErrorReportTriggeredEvent):
        meter = event.fetch_related_object()
        meter_id = meter.id

        # Record the failures and alert your team
        # Add your logic here

    return jsonify(success=True), 200
except Exception as e:
    return jsonify(error=str(e)), 400

if __name__ == '__main__':
    app.run(port=4242)
```

#### Uso del `context`

#### Eventos instantáneos

Este fragmento de código es una función de webhook configurada para comprobar los eventos recibidos, detectar la cuenta de origen, si corresponde, gestionar el evento y devolver una respuesta `200`.

#### Ruby

```ruby
require 'json'

# Using Sinatra
post '/webhook' do
  payload = request.body.read
  event = nil

  begin
    event = Stripe::Event.construct_from(
      JSON.parse(payload, symbolize_names: true)
    )
  rescue JSON::ParserError => e
    # Invalid payload
    status 400
    return
  end

  # Extract the context
  context = event.context

  # Define your API key variables (ideally loaded securely)
  ACCOUNT_123_API_KEY = "sk_test_123"
  ACCOUNT_456_API_KEY = "sk_test_456"

  account_api_keys = {
    "account_123" => ACCOUNT_123_API_KEY,
    "account_456" => ACCOUNT_456_API_KEY
  }

  api_key = account_api_keys[context]

  if api_key.nil?
    puts "No API key found for context: #{context}"
    status 400
    return
  end

  # Handle the event
  case event.type
  when 'customer.created'
    customer = event.data.object

    begin
      latest_customer = Stripe::Customer.retrieve(
        customer.id,
        { api_key: api_key }
      )
      handle_customer_created(latest_customer, context)
    rescue => e
      puts "Error retrieving customer: #{e.message}"
      status 500
      return
    end

  when 'payment_method.attached'
    payment_method = event.data.object

    begin
      latest_payment_method = Stripe::PaymentMethod.retrieve(
        payment_method.id,
        { api_key: api_key }
      )
      handle_payment_method_attached(latest_payment_method, context)
    rescue => e
      puts "Error retrieving payment method: #{e.message}"
      status 500
      return
    end

  else
    puts "Unhandled event type: #{event.type}"
  end

  status 200
end
```

#### Gestor de eventos ligeros (Clover+)

Usa la propiedad `context` de `EventNotification` para identificar la cuenta para eventos dentro de tu [organización](https://docs.stripe.com/get-started/account/orgs.md). Debes establecer el [encabezado Stripe Context](https://docs.stripe.com/context.md) manualmente para todas las llamadas a la API excepto `.fetchRelatedObject()` y `.fetchEvent()`, que lo hacen automáticamente.

#### Python

```python
org_api_key = os.environ.get("STRIPE_API_KEY")
webhook_secret = os.environ.get("WEBHOOK_SECRET")
client = StripeClient(org_api_key)

# inside your webhook handler
event_notification = client.parse_event_notification(payload, sig_header, webhook_secret)

# uses `context` automatically
event_notification.fetch_event()

# pass context manually for other API requests
client.v1.invoices.list(stripe_context=event_notification.context)
```

#### Gestor de eventos ligeros (Acacia o Basil)

Este fragmento de código es una función webhook configurada para recibir eventos específicos en toda una organización, verificar la firma, determinar la cuenta original con el campo de `context` y utilizar la clave API de esa cuenta para llamadas API posteriores.

#### Python

```python
import os
from flask import Flask, request, jsonify
from stripe import StripeClient
from stripe.events import V1BillingMeterErrorReportTriggeredEvent

app = Flask(__name__)

org_api_key = os.environ.get("STRIPE_API_KEY")
webhook_secret = os.environ.get("WEBHOOK_SECRET")
client = StripeClient(org_api_key)

account_api_keys = {
    "account_123": os.environ.get("ACCOUNT_123_API_KEY"),
    "account_456": os.environ.get("ACCOUNT_456_API_KEY"),
}

@app.route("/webhook", methods=["POST"])
def webhook():
    payload = request.data
    sig_header = request.headers.get("Stripe-Signature")

    try:
        thin_event = client.parse_thin_event(payload, sig_header, webhook_secret)

        # Retrieve the event using the org client to inspect context
        event = client.v2.core.events.retrieve(thin_event.id)

        context = getattr(event, "context", None)
        if not context:
            return jsonify(error="Missing context"), 400

        account_key = account_api_keys.get(context)
        if not account_key:
            return jsonify(error="Unknown context"), 400

        account_client = StripeClient(account_key)
        full_event = account_client.v2.core.events.retrieve(thin_event.id)

        if isinstance(full_event, V1BillingMeterErrorReportTriggeredEvent):
            meter = full_event.fetch_related_object()
            meter_id = meter.id
            # Record the failures and alert your team
            # Add your logic here

        return jsonify(success=True), 200
    except Exception as e:
        return jsonify(error=str(e)), 400

if __name__ == "__main__":
    app.run(port=4242)
```

## Prueba tu controlador

Antes de activar la función del punto de conexión de tu webhook, te recomendamos probar la integración de tu aplicación. Para ello, configura un oyente local para que envíe eventos a tu máquina local y enviando eventos de prueba. Debes usar la [CLI](https://docs.stripe.com/stripe-cli.md) para hacer una prueba.

#### Reenvía eventos a un punto de conexión local

Para reenviar eventos a tu punto de conexión local, ejecuta el siguiente comando con la [CLI](https://docs.stripe.com/stripe-cli.md) para configurar un oyente local. La marca `--forward-to` envía todos los [eventos de Stripe](https://docs.stripe.com/cli/trigger#trigger-event) de un [entorno de prueba](https://docs.stripe.com/sandboxes.md) al punto de conexión de tu webhook local. Utilice los comandos de CLI adecuados que aparecen a continuación en función de si utilizas eventos [ligeros](https://docs.stripe.com/event-destinations.md#events-overview) o de instantáneas.

#### Reenviar eventos de instantáneas

Utiliza el siguiente comando para reenviar [eventos de instantáneas](https://docs.stripe.com/event-destinations.md#events-overview) a tu oyente local.

```bash
stripe listen --forward-to localhost:4242/webhook
```

#### Reenviar eventos ligeros

Utiliza el siguiente comando para reenviar [eventos ligeros](https://docs.stripe.com/event-destinations.md#events-overview) a tu oyente local.

```bash
$ stripe listen --forward-thin-to localhost:4242/webhook --thin-events "*"
```

> También puedes ejecutar `stripe listen` para ver eventos en [Stripe Shell](https://docs.stripe.com/workbench/shell.md), aunque no podrás reenviar eventos desde el shell a tu punto de conexión local.

Las configuraciones útiles para ayudarte a probar tu oyente local incluyen las siguientes:

- Para deshabilitar la verificación del certificado HTTPS, usa el indicador opcional `--skip-verify`.
- Para reenviar solo eventos específicos, usa el indicador opcional `--events` en una lista de eventos separados por comas.

#### Reenviar eventos de instantáneas de destino

Utiliza el siguiente comando para reenviar los eventos de instantáneas de destino al oyente local.

```bash
stripe listen --events payment_intent.created,customer.created,payment_intent.succeeded,checkout.session.completed,payment_intent.payment_failed \
  --forward-to localhost:4242/webhook
```

#### Reenviar eventos ligeros de destino

Utiliza el siguiente comando para reenviar eventos limitados de destino a tu oyente local.

```bash
stripe listen --thin-events v1.billing.meter.error_report_triggered,v1.billing.meter.no_meter_found \
  --forward-thin-to localhost:4242/webhook
```

- Para reenviar eventos a tu punto de conexión local de webhooks desde el punto de conexión público de webhooks que ya registraste en Stripe, usa el indicador opcional `--load-from-webhooks-api`. Este carga tu punto de conexión registrado, analiza la ruta y sus eventos registrados y luego agrega la ruta a tu punto de conexión de webhook local en `--forward-to path`.

#### Reenviar eventos de instantáneas desde un punto de conexión de webhook público

Utiliza el siguiente comando para reenviar eventos de instantáneas desde un punto de conexión de webhook público a tu oyente local.

```bash
stripe listen --load-from-webhooks-api --forward-to localhost:4242/webhook
```

#### Reenviar eventos ligeros desde un punto de conexión de webhook público

Utiliza el siguiente comando para reenviar eventos ligeros desde un punto de conexión de webhook público a tu oyente local.

```bash
stripe listen --load-from-webhooks-api --forward-thin-to localhost:4242/webhook
```

- Para comprobar las firmas del webhook, utiliza el `{{WEBHOOK_SIGNING_SECRET}}` de la salida inicial del comando de escucha.

```output
Ready! Your webhook signing secret is '{{WEBHOOK_SIGNING_SECRET}}' (^C to quit)
```

#### Cómo activar eventos de prueba

Para enviar eventos de prueba, activa un tipo de evento al que está suscrito el destino de tu evento creando manualmente un objeto en el Dashboard de Stripe. Obtén más información sobre cómo activar eventos con [Stripe para VS Code](https://docs.stripe.com/stripe-vscode.md).

#### Activa un evento de instantánea

Puedes usar el siguiente comando en [Stripe Shell](https://docs.stripe.com/workbench/shell.md) o [Stripe CLI](https://docs.stripe.com/stripe-cli.md). Este ejemplo activa un evento `payment_intent.succeeded`:

```bash
stripe trigger payment_intent.succeeded
Running fixture for: payment_intent
Trigger succeeded! Check dashboard for event details.
```

#### Activar un evento ligero

Puedes usar el siguiente comando en la [CLI de Stripe](https://docs.stripe.com/stripe-cli.md). Este ejemplo activa un evento `v1.Billing.meter.error_report_triggered`:

```bash
stripe trigger v1.billing.meter.error_report_triggered
Setting up fixture for: list_billing_meters
Running fixture for: list_billing_meters
Setting up fixture for: billing_meter
Running fixture for: billing_meter
Setting up fixture for: list_billing_meters_after_creation
Running fixture for: list_billing_meters_after_creation
Setting up fixture for: billing_meter_event_session
Running fixture for: billing_meter_event_session
Setting up fixture for: create_billing_meter_event_stream
Running fixture for: create_billing_meter_event_stream
Trigger succeeded! Check dashboard for event details.
```

## Registra tu punto de conexión

Después de probar la función de punto de conexión de webhook, usa la pestaña [API](https://docs.stripe.com/api/v2/event-destinations.md) o **Webhooks** en Workbench para registrar la URL accesible de tu punto de conexión de webhook para que Stripe sepa adónde enviar los eventos. Puedes registrar hasta 16 puntos de conexión de webhook en Stripe. Los puntos de conexión de webhook registrados deben ser URL **HTTPS** de acceso público.

#### Formato de URL de webhooks

El formato de URL para registrar un punto de conexión de webhook es el siguiente:

```
https://<your-website>/<your-webhook-endpoint>
```

Por ejemplo, si tu dominio es `https://mycompanysite.com` y la ruta a tu punto de conexión de webhooks es `@app.route('/stripe_webhooks', methods=['POST'])`, especifica `https://mycompanysite.com/stripe_webhooks` como la **URL del punto de conexión**.

#### Crea un destino de evento para el punto de conexión de tu webhook

Crea un destino de evento usando Workbench en el Dashboard o mediante programación con la [API](https://docs.stripe.com/api/v2/event-destinations.md). Puedes registrar hasta 16 destinos de eventos en cada cuenta de Stripe.

#### Dashboard

Para crear un nuevo punto de conexión de webhook en el Dashboard, haz lo siguiente:

1. Abre la pestaña [Webhooks](https://dashboard.stripe.com/webhooks) en Workbench.
1. Haz clic en **Crea un destino de evento**.
1. Selecciona desde dónde quieres recibir los eventos. Stripe admite dos tipos de configuraciones: **Tu cuenta** y [Cuentas conectadas](https://docs.stripe.com/connect.md). Selecciona **Cuenta** para escuchar los eventos de tu propia cuenta. Si has creado una [aplicación de Connect](https://docs.stripe.com/connect.md) y quieres escuchar eventos de tus cuentas conectadas, selecciona **Cuentas conectadas**.

> #### Escucha los eventos de un punto de conexión de webhooks de la organización
> 
> Si creas un punto de conexión de webhook en una [cuenta de organización](https://docs.stripe.com/get-started/account/orgs.md), selecciona **Cuentas** para escuchar los eventos de las cuentas de tu organización. Si tienes [plataformas Connect](https://docs.stripe.com/connect.md) como miembros de tus organizaciones y quieres escuchar los eventos de las cuentas conectadas de todas las plataformas, selecciona **Cuentas conectadas**.

1. Selecciona la versión de la API para el [objeto Events](https://docs.stripe.com/api/events.md) que quieres consumir.
1. Selecciona los [tipos de eventos](https://docs.stripe.com/api/events/types.md) que quieres enviar a un punto de conexión de webhook.
1. Selecciona **Continúa** y, a continuación, elige **Punto de conexión de webhook** como tipo de destino.
1. Haz clic en **Continúa** y, a continuación, proporciona la **URL de punto de conexión** y una descripción opcional del webhook.

#### API

Puedes crear un nuevo destino de evento que te notifique cuando se active un error de validación de la [facturación basada en el consumo](https://docs.stripe.com/billing/subscriptions/usage-based.md) mediante la [API](https://docs.stripe.com/api/v2/event-destinations.md).

Si creaste una [aplicación de Connect](https://docs.stripe.com/connect.md) y quieres escuchar a tus cuentas conectadas, usa el parámetro [events_from](https://docs.stripe.com/api/v2/event-destinations/create.md#v2_create_event_destinations-events_from) y establece su valor de enumeración en `accounts`.

```curl
curl -X POST https://api.stripe.com/v2/core/event_destinations \
  -H "Authorization: Bearer <<YOUR_SECRET_KEY>>" \
  -H "Stripe-Version: 2026-01-28.preview" \
  --json '{
    "name": "My event destination",
    "description": "This is my event destination, I like it a lot",
    "type": "webhook_endpoint",
    "event_payload": "thin",
    "enabled_events": [
        "v1.billing.meter.error_report_triggered"
    ],
    "webhook_endpoint": {
        "url": "https://example.com/my/webhook/endpoint"
    }
  }'
```

> [Workbench](https://docs.stripe.com/workbench.md) sustituye al actual [Dashboard de desarrolladores](https://docs.stripe.com/development/dashboard.md). Si sigues usando el Dashboard de desarrolladores, consulta cómo [crear un nuevo punto de conexión webhook](https://docs.stripe.com/development/dashboard/webhooks.md).

## Protege tu punto de conexión

Después de confirmar que tu punto de conexión funciona como se esperaba, asegúralo implementando las [mejores prácticas de webhooks](https://docs.stripe.com/webhooks.md#best-practices).

Asegura tu integración comprobando que tu controlador verifica que todas las solicitudes de webhook son generadas por Stripe. Puedes verificar las firmas de webhook utilizando nuestras bibliotecas oficiales o verificarlas manualmente.

#### Haz la verificación con las bibliotecas oficiales (recomendada)

### Haz la verificación manual de las firmas con las bibliotecas oficiales

Te recomendamos que uses nuestra biblioteca oficial para verificar las firmas. Para hacer la verificación, proporciona una carga de evento, el encabezado `Stripe-Signature` y el secreto del punto de conexión. Si falla la verificación, verás un error.

Si recibes un error de verificación de firma, lee nuestra guía para [solucionarlo](https://docs.stripe.com/webhooks/signature.md).

> Stripe requiere el cuerpo sin procesar para realizar la solicitud de verificación de la firma. Si estás usando una plataforma, asegúrate de que no manipule el cuerpo sin procesar. Cualquier manipulación del cuerpo sin procesar de la solicitud hace que la verificación falle.

#### Ruby

```ruby

# Set your secret key. Remember to switch to your live secret key in production.
# See your keys here: https://dashboard.stripe.com/apikeys
Stripe.api_key = '<<YOUR_SECRET_KEY>>'

require 'stripe'
require 'sinatra'

# If you are testing your webhook locally with the Stripe CLI you
# can find the endpoint's secret by running `stripe listen`
# Otherwise, find your endpoint's secret in your webhook settings in
# the Developer Dashboardendpoint_secret = 'whsec_...'

# Using the Sinatra framework
set :port, 4242

post '/my/webhook/url' do
  payload = request.body.readsig_header = request.env['HTTP_STRIPE_SIGNATURE']
  event = nil

  beginevent = Stripe::Webhook.construct_event(
      payload, sig_header, endpoint_secret
    )
  rescue JSON::ParserError => e
    # Invalid payload
    puts "Error parsing payload: #{e.message}"
    status 400
    return
  rescue Stripe::SignatureVerificationError => e# Invalid signature
    puts "Error verifying webhook signature: #{e.message}"
    status 400
    return
  end

  # Handle the event
  case event.type
  when 'payment_intent.succeeded'
    payment_intent = event.data.object # contains a Stripe::PaymentIntent
    puts 'PaymentIntent was successful!'
  when 'payment_method.attached'
    payment_method = event.data.object # contains a Stripe::PaymentMethod
    puts 'PaymentMethod was attached to a Customer!'
  # ... handle other event types
  else
    puts "Unhandled event type: #{event.type}"
  end

  status 200
end
```

#### Haz la verificación manual

### Haz la verificación manual de las firmas de webhook

Si bien te recomendamos que uses nuestra biblioteca oficial para verificar firmas de eventos de webhook, puedes crear una solución personalizada siguiendo esta sección.

El encabezado '`Stripe-Signature` incluido en cada evento firmado contiene una marca temporal y una o más firmas que debes verificar. La marca temporal tiene un prefijo `t=` y cada firma tiene un prefijo *scheme*. Los esquemas comienzan con `v`, seguido de un número entero. Actualmente, el único esquema válido de firma en modo activo es `v1`. Para facilitar las pruebas, Stripe envía una firma adicional con un esquema `v0` falso, para los eventos de prueba.

```
Stripe-Signature:
t=1492774577,
v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd,
v0=6ffbb59b2300aae63f272406069a9788598b792a944a07aba816edb039989a39
```

> Proporcionamos nuevas líneas para que la claridad sea mayor, pero el encabezado `Stripe-Signature` real está en una única línea.

Stripe genera firmas utilizando el código de autenticación de mensajes basado en hash ([HMAC](https://en.wikipedia.org/wiki/Hash-based_message_authentication_code)) con [SHA-256](https://en.wikipedia.org/wiki/SHA-2). Para evitar los [ataques de degradación](https://en.wikipedia.org/wiki/Downgrade_attack), ignora todos los esquemas que no sean `v1`.

Es posible que tengas varias firmas con el mismo par esquema-secreto cuando [cambias el secreto de un punto de conexión](https://docs.stripe.com/webhooks.md#roll-endpoint-secrets) y eliges mantener el secreto anterior activo durante un máximo de 24 horas. Durante este período, tu punto de conexión tiene varios secretos activos y Stripe genera una firma para cada secreto.

Para crear una solución manual de verificación de firmas, debes completar los siguientes pasos:

#### Paso 1: extrae la marca temporal y las firmas del encabezado

Divide el encabezado con el carácter `,` como separador para obtener una lista de elementos. Luego, divide cada elemento con el carácter `=` como separador para obtener un par de prefijo y valor.

El valor del prefijo `t` corresponde a la marca temporal, y `v1` corresponde a la firma (o firmas). Puedes descartar el resto de elementos.

#### Paso 2: preparar la cadena `signed_payload`

La cadena `signed_payload` se crea al concatenar los siguientes elementos:

- La marca temporal (como cadena)
- El carácter `.`
- La carga real del JSON (esto es, el cuerpo de la petición)

#### Paso 3: determinar la firma prevista

Calcula un HMAC con la función hash SHA256. Utiliza el secreto de la firma del punto de conexión como clave y la cadena `signed_payload` como mensaje.

#### Paso 4: comparar las firmas

Compara la firma (o firmas) del encabezado con la firma prevista. Para obtener una coincidencia equivalente, calcula la diferencia entre la marca temporal actual y la recibida, y luego decide si la diferencia está dentro de tu tolerancia.

Para protegerte de los ataques de tiempo, utiliza una comparación de cadenas en tiempo constante para comparar la firma prevista con cada una de las firmas recibidas.

## Depura las integraciones de webhook

Pueden ocurrir varios tipos de problemas al entregar eventos al punto de conexión de tu webhook:

- Es posible que Stripe no pueda entregar un evento a tu punto de conexión de webhook.
- Tu punto de conexión de webhooks podría tener un problema con el SSL.
- La conectividad de tu red es intermitente.
- El punto de conexión de tu webhook no está recibiendo los eventos que esperabas recibir.

### Consulta las entregas de eventos

Para ver las entregas de eventos, selecciona el punto final del webhook en **Webhooks** y, a continuación, selecciona la pestaña **Eventos**. La pestaña **Eventos** proporciona una lista de eventos y si se `entregan`, `están pendientes` o `no`.Haz clic en un evento para ver los metadatos, incluido el código de estado HTTP del intento de entrega y la hora de las entregas futuras pendientes.

También puedes usar la [CLI de Stripe](https://docs.stripe.com/stripe-cli.md) para [escuchar eventos](https://docs.stripe.com/webhooks.md#test-webhook) directamente en tu terminal.

### Repara códigos de estado HTTP

Cuando un evento muestra un código de estado `200`, este indica que se ha entregado correctamente al punto de conexión del webhook. También puedes recibir un código de estado que no sea `200`. En la siguiente tabla, encontrarás una lista de los códigos de estado HTTP comunes y las soluciones recomendadas.

| Estado del webhook pendiente            | Descripción                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Reparar                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| (No se ha podido conectar) ERR          | No se puede establecer una conexión con el servidor de destino.                                                                                                                                                                                                                                                                                                                                                                                                                                             | Asegúrate de que tu dominio de host sea de acceso público por Internet.                                                                              |
| (`302`) ERR (u otro estado `3xx`)       | El servidor de destino ha intentado redirigir la petición a otra ubicación. Consideramos las respuestas de redireccionamiento a las peticiones de webhook como fallos.                                                                                                                                                                                                                                                                                                                                      | Establece el destino del punto de conexión del webhook a la URL resuelta por el redireccionamiento.                                                  |
| (`400`) ERR (u otro estado `4xx`)       | El servidor de destino no puede o rechaza procesar la petición. Esto puede ocurrir cuando el servidor detecta un error (`400`), cuando la URL de destino tiene restricciones de acceso (`401`, `403`) o cuando la URL de destino no existe (`404`).                                                                                                                                                                                                                                                         | - Asegúrate de que tu punto de conexión sea de acceso público por Internet.
  - Asegúrate de que tu punto de conexión acepte un método POST de HTTP. |
| (`500`) ERR (u otro estado `5xx`)       | El servidor de destino encontró un error mientras se procesaba la solicitud.                                                                                                                                                                                                                                                                                                                                                                                                                                | Revisa los registros de tu aplicación para comprender por qué está devolviendo un error `500`.                                                       |
| (Error de TLS) ERR                      | No hemos podido establecer una conexión segura con el servidor de destino. Los problemas con el certificado SSL/TLS o un certificado intermedio en la cadena de certificados del servidor de destino suelen causar estos errores. Stripe requiere *TLS* (TLS refers to the process of securely transmitting data between the client—the app or browser that your customer is using—and your server. This was originally performed using the SSL (Secure Sockets Layer) protocol) versión `v1.2` o superior. | Realiza una [prueba del servidor SSL](https://www.ssllabs.com/ssltest/) para descubrir los problemas que puedan causar este error.                   |
| (Se ha agotado el tiempo de espera) ERR | El servidor de destino tardó demasiado en responder a la petición de webhook.                                                                                                                                                                                                                                                                                                                                                                                                                               | Asegúrate de diferir la lógica compleja y devolver una respuesta correcta de inmediato en tu código de gestión de webhooks.                          |

## Comportamientos de entrega de eventos

En esta sección recibirás ayuda para comprender los diferentes comportamientos que puedes esperar en relación con la forma en que Stripe envía los eventos al punto de conexión de tu webhook.

### Reintentos automáticos

En modo activo, Stripe intenta entregar eventos en tu destino durante un máximo de tres días con un retroceso exponencial. Consulta cuándo se realizará el siguiente reintento, si corresponde, en la pestaña **Entregas de eventos** de tu destino de evento. Reintentamos las entregas de eventos creadas en un entorno de prueba tres veces en el transcurso de unas pocas horas. Si tu destino se ha deshabilitado o eliminado cuando hacíamos el reintento, evitamos reintentos de ese evento en el futuro. Sin embargo, si deshabilitas y luego vuelves a habilitar el destino del evento antes de que podamos hacer el reintento, seguirás viendo reintentos en el futuro.

### Reintentos manuales

Hay dos maneras de reintentar eventos manualmente:

- En el Dashboard de Stripe, haz clic en **Reenviar** cuando estés viendo un evento específico. Esto funciona hasta 15 días después de la creación del evento.
- Con el [CLI de Stripe](https://docs.stripe.com/cli/events/resend), ejecuta el comando `stripe events resend <event_id> --webhook-endpoint=<endpoint_id>`. Esto funciona hasta 30 días después de la creación del evento.

El reenvío manual de un evento que tuvo fallos de entrega anteriores a un punto de conexión de webhook no anula el [comportamiento de reintentos automáticos](https://docs.stripe.com/webhooks.md#automatic-retries) de Stripe, incluso si da como resultado un código de estado `2xx`. Aprende a [procesar eventos de webhook no entregados](https://docs.stripe.com/webhooks/process-undelivered-events.md) para detener futuros reintentos.

### Orden de los eventos

Stripe no garantiza la entrega de eventos en el orden en que se han generado. Por ejemplo, la creación de una suscripción puede generar los siguientes eventos:

- `customer.subscription.created`
- `invoice.created`
- `invoice.paid`
- `charge.created` (si hay un cargo)

Asegúrate de que el destino de tu evento no dependa de que recibas los eventos en un orden específico. Prepárate para gestionar la entrega de forma adecuada. También puedes usar la API para recuperar los objetos que falten. Por ejemplo, puedes recuperar los objetos Invoice, Charge y Subscription con la información de `invoice.paid` si recibes este evento primero.

### Control de versiones de API

La versión de la API en la configuración de tu cuenta cuando se produce el evento dicta la versión de la API y, por lo tanto, la estructura de un [Event](https://docs.stripe.com/api/events.md) enviado a tu destino. Por ejemplo, si tu cuenta está configurada con una versión de API anterior, como 2015-02-16, y cambias la versión de API para una solicitud específica con la [versión](https://docs.stripe.com/api.md#versioning), el objeto [Event](https://docs.stripe.com/api/events.md) generado y enviado a tu destino seguirá basándose en la versión de API 2015-02-16. No puedes cambiar los objetos [Event](https://docs.stripe.com/api/events.md) después de su creación. Por ejemplo, si actualizas un cargo, el evento del cargo original permanecerá sin cambios. En consecuencia, las actualizaciones posteriores de la versión de la API de tu cuenta no modificarán retroactivamente los objetos [Event](https://docs.stripe.com/api/events.md) existentes. La recuperación de un [Event](https://docs.stripe.com/api/events.md) anterior llamando a `/v1/events` con una versión de API más reciente tampoco influye en la estructura del evento recibido. Puedes definir destinos de eventos de prueba para tu versión de API predeterminada o para la última versión de API. El [Event](https://docs.stripe.com/api/events.md) enviado al destino se estructura para la versión especificada del destino del evento.

## Mejores prácticas para el uso de webhooks

Revisa estas prácticas recomendadas para asegurarte de que los puntos de conexión de tu webhook estén protegidos y funcionen bien con tu integración.

### Gestiona eventos duplicados

En ocasiones, los puntos de conexión de webhooks pueden recibir el mismo evento más de una vez. Puedes protegerte contra los recibos de eventos duplicados registrando los [ID de eventos](https://docs.stripe.com/api/events/object.md#event_object-id) que has procesado y no procesando los eventos ya registrados.

En algunos casos, se generan y envían dos objetos Event separados. Para identificar estos elementos duplicados, utiliza el ID del objeto en `data.object` junto con el `event.type`.

### Escucha solo los tipos de eventos que requiere tu integración

Configura los puntos de conexión de webhook para recibir solo los tipos de eventos que tu integración necesita. Si escuchas otros eventos (o todos los eventos) se producirá una saturación indebida en tu servidor que no es recomendable.

Puedes [modificar los eventos](https://docs.stripe.com/api/webhook_endpoints/update.md#update_webhook_endpoint-enabled_events) que recibe un punto de conexión de webhooks en el Dashboard o con la API.

### Gestiona eventos de forma asíncrona

Configura tu controlador para procesar eventos entrantes con una cola asíncrona. Es posible que tengas problemas de escalabilidad si decides procesar los eventos de forma sincronizada. Cualquier gran aumento en las entregas de webhook (por ejemplo, a principios de mes, cuando se renuevan todas las suscripciones) podría saturar los servidores de tus puntos de conexión.

Las colas asíncronas te permiten procesar los eventos simultáneos a una velocidad que el sistema puede admitir.

### Exime a la ruta de webhook de la protección CSRF

Si usas Rails, Django u otro marco web, tu sitio podría comprobar automáticamente si cada petición POST contiene un *token CSRF*. Esta es una función de seguridad importante que ayuda a protegerte a ti y a tus usuarios de intentos de [falsificación de peticiones en sitios cruzados](https://www.owasp.org/index.php/Cross-Site_Request_Forgery_\(CSRF\)). No obstante, esta medida de seguridad también puede impedir que tu sitio procese eventos legítimos. De ser así, quizá sea necesario que la ruta de webhooks quede excluida de la protección CSRF.

#### Rails

```ruby
class StripeController < ApplicationController
  # If your controller accepts requests other than Stripe webhooks,
  # you'll probably want to use `protect_from_forgery` to add CSRF
  # protection for your application. But don't forget to exempt
  # your webhook route!
  protect_from_forgery except: :webhook

  def webhook
    # Process webhook data in `params`
  end
end
```

### Recibir eventos con un servidor HTTPS

Si usas una URL HTTPS para el punto de conexión del webhook (obligatorio en el modo activo), Stripe valida que la conexión con el servidor sea segura antes de enviar los datos de tu webhook. Para que esto funcione, el servidor debe estar correctamente configurado para ser compatible con HTTPS con un certificado de servidor válido. Los webhooks de Stripe solo son compatibles con las versiones v1.2 y v1.3 de *TLS* (TLS refers to the process of securely transmitting data between the client—the app or browser that your customer is using—and your server. This was originally performed using the SSL (Secure Sockets Layer) protocol).

### Cambia periódicamente los secretos de firma de los puntos de conexión

El secreto utilizado para verificar que los eventos provienen de Stripe se puede modificar en la pestaña **Webhooks** de Workbench. Para mantenerlos a salvo, te recomendamos que renueves (cambies) los secretos periódicamente o cuando sospeches que un secreto se ha visto comprometido.

Cómo cambiar un secreto:

1. Haz clic en cada punto de conexión de la pestaña **Webhooks** de Workbench para el que quieras renovar el secreto.
1. Dirígete al menú de desbordamiento (⋯) y haz clic en **Cambiar secreto**. Puedes optar por la caducidad inmediatamente del secreto actual o retrasarla por hasta 24 horas para que tengas tiempo de actualizar el código de verificación en tu servidor. Durante este período, habrá varios secretos activos para el punto de conexión. Stripe generará una firma por secreto hasta su caducidad.

### Verifica que los eventos se envíen desde Stripe

Stripe envía eventos de webhook desde una lista establecida de direcciones IP. Confía solo en los eventos que provengan de estas [direcciones IP](https://docs.stripe.com/ips.md).

Verifica también las firmas de webhook para confirmar que Stripe ha enviado los eventos recibidos. Stripe firma los eventos de webhook que envía a tus puntos de conexión incluyendo una firma en el encabezado `Stripe-Signature` de cada evento. Esto te permite verificar que fue Stripe quien envió los eventos y no un tercero. Puedes verificar las firmas usando nuestras [bibliotecas oficiales](https://docs.stripe.com/webhooks.md#verify-official-libraries) o [verificarlas manualmente](https://docs.stripe.com/webhooks.md#verify-manually) usando tu propia solución.

En la siguiente sección, se describe cómo verificar las firmas de webhook:

1. Recupera el secreto de tu punto de conexión.
1. Verifica la firma.

#### Cómo recuperar el secreto de tu punto de conexión

Usa Workbench y ve a la pestaña **Webhooks** para ver todos tus puntos de conexión. Selecciona un punto de conexión para el que quieras obtener la clave secreta y, a continuación, haz clic en **Haz clic para revelar**.

Stripe genera una clave secreta única para cada punto de conexión. Si utilizas el mismo punto de conexión para ambas [claves de API en modo de prueba y en modo activo](https://docs.stripe.com/keys.md#test-live-modes), la clave secreta será diferente para cada uno. Además, si utilizas varios puntos de conexión, debes obtener una clave secreta para cada uno de los que quieras verificar las firmas. Después de esta configuración, Stripe comenzará a firmar cada webhook que envía al punto de conexión.

### Prevención de ataques de reproducción

Un [ataque de repetición](https://en.wikipedia.org/wiki/Replay_attack) ocurre cuando un atacante intercepta una carga válida y su firma, y luego las retransmite. Para mitigar tales ataques, Stripe incluye una marca temporal en el encabezado `Stripe-Signature`. Debido a que esta marca de tiempo es parte de la carga firmada, también se verifica mediante la firma, por lo que un atacante no puede cambiar la marca temporal sin invalidar la firma. Si la firma es válida, pero la marca temporal es demasiado antigua, tu aplicación puede rechazar la carga.

Nuestras bibliotecas tienen una tolerancia predeterminada de cinco minutos entre la marca temporal y la hora actual. Puedes cambiar esta tolerancia proporcionando un parámetro adicional al verificar las firmas. Utiliza el protocolo de tiempo de redes ([NTP](https://en.wikipedia.org/wiki/Network_Time_Protocol)) para asegurarte de que el reloj de simulación de tu servidor sea preciso y esté sincronizado con la hora de los servidores de Stripe.

> No uses un valor de tolerancia de `0`. Al usar un valor de tolerancia de `0` se desactiva por completo la comprobación de recencia.

Stripe genera la marca temporal y la firma cada vez que enviamos un evento a tu punto de conexión. Si Stripe reintenta un evento (por ejemplo, tu punto de conexión ha respondido previamente con un código de estado que no es`2xx`), generaremos una nueva firma y una marca temporal para el nuevo intento de entrega.

### Devolver rápidamente una respuesta 2xx

Tu [punto de conexión](https://docs.stripe.com/webhooks.md#example-endpoint) debe devolver rápidamente un código de estado satisfactorio (`2xx`) antes de que una lógica compleja pueda hacer que se agote el tiempo de espera. Por ejemplo, debes devolver una respuesta `200` antes de actualizar la factura del cliente como pagada en tu sistema contable.

## See also

- [Envía eventos a tu cuenta de Amazon EventBridge](https://docs.stripe.com/event-destinations/eventbridge.md)
- [Lista de tipos de eventos ligeros](https://docs.stripe.com/api/v2/events/event-types.md)
- [Lista de tipos de eventos de instantánesa](https://docs.stripe.com/api/events/.md)
- [Generador interactivo de puntos de conexión de webhooks](https://docs.stripe.com/webhooks/quickstart.md)

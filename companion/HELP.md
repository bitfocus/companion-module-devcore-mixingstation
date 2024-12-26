# Mixing Station

This module provides access to the mixer parameters exposed via the [Mixing Station](https://mixingstation.app) API.

## Requirements

- Desktop version of Mixing Station (>= V2.2.0)
- Companion

## Setup

1. Open Mixing Station and enable the REST api (see [manual](https://mixingstation.app/ms-docs/integrations/apis/))
2. Add the `Mixing Station` module to companion
3. Enter the IP (usually `localhost`) and Port (usually `8080`) of the API

## Usage

The module provides actions for setting values, feedback for changing the button state and parameters.

### Feedback / Variables

The module will dynamically create variables based on the configured feedback items. Thus, if you want to display
a variable of a mixer value, make sure to create a feedback item for it first.
Afterward, a new variable will be available in companion.
/*
 * This file is part of the TYPO3 CMS project.
 *
 * It is free software; you can redistribute it and/or modify it under
 * the terms of the GNU General Public License, either version 2
 * of the License, or any later version.
 *
 * For the full copyright and license information, please read the
 * LICENSE.txt file that was distributed with this source code.
 *
 * The TYPO3 project - inspiring people to share!
 */

import {customElement, property} from 'lit/decorators';
import {html, LitElement, TemplateResult} from 'lit';
import BrowserSession from '@typo3/backend/storage/browser-session';
import {ifDefined} from 'lit/directives/if-defined';

@customElement('typo3-backend-live-search-option-item')
export class SearchOptionItem extends LitElement {
  @property({type: Boolean, attribute: false}) active: boolean = false;
  @property({type: String}) optionId: string;
  @property({type: String}) optionName: string;
  @property({type: String}) optionLabel: string;

  public createRenderRoot(): HTMLElement | ShadowRoot {
    // Avoid shadow DOM for Bootstrap CSS to be applied
    return this;
  }

  protected render(): TemplateResult {
    this.active = BrowserSession.get(this.getStorageKey()) === '1';

    return html`
      <div class="form-check">
        <input type="checkbox" class="form-check-input" name="${this.optionName}" id="${this.optionId}" checked=${ifDefined(this.active ? 'checked' : undefined)} @input="${this.handleInput}">
        <label class="form-check-label" for="${this.optionId}">
          ${this.optionLabel}
        </label>
      </div>
    `;
  }

  private getStorageKey(): string {
    return `livesearch-option-${this.optionName}-${this.optionId}`;
  }

  private handleInput() {
    this.active = !this.active;

    BrowserSession.set(this.getStorageKey(), this.active ? '1' : '0');
  }
}
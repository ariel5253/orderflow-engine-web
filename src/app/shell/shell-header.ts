import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { languageKey, languageNameKey } from '../core/dictionary-keys';
import { ActiveLanguage, Language, SUPPORTED_LANGUAGES } from '../core/language';
import { UiText } from '../ui/ui-text/ui-text';
import { StorePicker } from './store-picker';

/**
 * The shell every screen starts with (SPEC §10.1): the brand, the navigation ("Shop"), the ES/EN switch and the store
 * picker. Everything wraps; nothing is cut.
 */
@Component({
  selector: 'app-shell-header',
  imports: [RouterLink, RouterLinkActive, TranslatePipe, UiText, StorePicker],
  templateUrl: './shell-header.html',
  styleUrl: './shell-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellHeader {
  private readonly language = inject(ActiveLanguage);

  protected readonly languages = SUPPORTED_LANGUAGES;
  protected readonly languageKey = languageKey;
  protected readonly languageNameKey = languageNameKey;

  protected isActive(language: Language): boolean {
    return this.language.current() === language;
  }

  protected use(language: Language): void {
    this.language.use(language);
  }
}

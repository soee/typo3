<?php

declare(strict_types=1);

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

namespace TYPO3\CMS\Fluid\Tests\Functional\ViewHelpers\Format;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Fluid\Core\Rendering\RenderingContextFactory;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;
use TYPO3Fluid\Fluid\View\TemplateView;

final class Nl2brViewHelperTest extends FunctionalTestCase
{
    protected bool $initializeDatabase = false;

    public static function renderDataProvider(): array
    {
        return [
            'viewHelperDoesNotModifyTextWithoutLineBreaks' => [
                '<f:format.nl2br><p class="bodytext">Some Text without line breaks</p></f:format.nl2br>',
                '<p class="bodytext">Some Text without line breaks</p>',
            ],
            'viewHelperConvertsLineBreaksToBRTags' => [
                '<f:format.nl2br>' . 'Line 1' . chr(10) . 'Line 2' . '</f:format.nl2br>',
                'Line 1<br />' . chr(10) . 'Line 2',
            ],
            'viewHelperConvertsWindowsLineBreaksToBRTags' => [
                '<f:format.nl2br>' . 'Line 1' . chr(13) . chr(10) . 'Line 2' . '</f:format.nl2br>',
                'Line 1<br />' . chr(13) . chr(10) . 'Line 2',
            ],
        ];
    }

    #[DataProvider('renderDataProvider')]
    #[Test]
    public function render(string $template, string $expected): void
    {
        $context = $this->get(RenderingContextFactory::class)->create();
        $context->getTemplatePaths()->setTemplateSource($template);
        self::assertSame($expected, (new TemplateView($context))->render());
    }
}

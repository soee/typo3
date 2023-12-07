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

namespace TYPO3\CMS\Seo\Tests\Unit\Event;

use TYPO3\CMS\Core\Domain\Page;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Http\Uri;
use TYPO3\CMS\Seo\Event\ModifyUrlForCanonicalTagEvent;
use TYPO3\TestingFramework\Core\Unit\UnitTestCase;

final class ModifyUrlForCanonicalTagEventTest extends UnitTestCase
{
    /**
     * @test
     */
    public function gettersReturnInitializedObjects(): void
    {
        $url = (string)new Uri('https://example.com');
        $request = (new ServerRequest($url));
        $page = new Page(['uid' => 123]);
        $event = new ModifyUrlForCanonicalTagEvent($url, $request, $page);

        self::assertEquals($url, $event->getUrl());
        self::assertEquals($request, $event->getRequest());
        self::assertEquals($page, $event->getPage());
    }
}